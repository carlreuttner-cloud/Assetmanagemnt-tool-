import "server-only";
import { texte } from "@/i18n";
import type { Kontext } from "@/lib/auth/kontext";
import { alsDbDatum, heute } from "@/lib/datum";
import { dezimal } from "@/lib/geld";
import { formatierer } from "@/lib/format";
import { baueDatenpaket, type AnalyseEingabe, type Datenpaket } from "@/lib/ki-analyse";
import { ladeCheckliste } from "./dokumente";
import { ladeGeschaeftsjahre } from "./finanzen";
import { erlaubt, ladeRechengrundlage } from "./portfolio";

/**
 * Datenpaket für die KI-Analyse einer Gesellschaft aus den gespeicherten Daten am heutigen
 * Stichtag. null, wenn die Gesellschaft nicht existiert oder nicht sichtbar ist.
 */
export async function ladeDatenpaket(kontext: Kontext, gesellschaftId: string): Promise<Datenpaket | null> {
  const { db } = kontext;
  const stichtag = heute();
  const grundlage = await ladeRechengrundlage(kontext);
  const g = await db.gesellschaft.findFirst({
    where: { id: erlaubt(grundlage.sicht.gesellschaftIds, gesellschaftId) },
    select: {
      id: true,
      name: true,
      rechtsform: true,
      haeuser: {
        orderBy: { bezeichnung: "asc" },
        select: { id: true, bezeichnung: true, verkehrswerte: { where: { stichtag: { lte: alsDbDatum(stichtag) } }, orderBy: { stichtag: "desc" }, take: 1, select: { quelle: true } } },
      },
      kredite: { orderBy: { bezeichnung: "asc" }, select: { id: true, bezeichnung: true, bank: true, covenants: true } },
      gesellschafter: { select: { gewinnanteilProzent: true, bewegungen: { select: { art: true, datum: true } } } },
      waterfallvertrag: { select: { vorzugsrenditeProzent: true, quelle: true } },
    },
  });
  if (!g) return null;

  const [geschaeftsjahre, checkliste] = await Promise.all([
    ladeGeschaeftsjahre(kontext, g.id),
    ladeCheckliste(kontext),
  ]);
  const hausIds = new Set(g.haeuser.map((h) => h.id));
  const kreditIds = new Set(g.kredite.map((k) => k.id));
  const dokumente = checkliste.zeilen
    .filter((z) => (z.objekt.bezug === "GESELLSCHAFT" && z.objekt.id === g.id) || (z.objekt.bezug === "HAUS" && hausIds.has(z.objekt.id)) || (z.objekt.bezug === "KREDIT" && kreditIds.has(z.objekt.id)))
    .flatMap((z) => z.zellen.map((c) => ({ objekt: z.objekt.name, vorgabe: c.vorgabe.name, status: c.bewertung.status, href: `/dokumente/${z.objekt.bezug.toLowerCase()}/${z.objekt.id}` })));

  const einlagen = g.gesellschafter.flatMap((x) => x.bewegungen.filter((b) => b.art === "EINLAGE"));
  const eingabe: AnalyseEingabe = {
    stichtag,
    gesellschaft: { id: g.id, name: g.name, rechtsform: g.rechtsform },
    haeuser: g.haeuser.flatMap((h) => {
      const daten = grundlage.haeuser.find((x) => x.id === h.id);
      return daten ? [{ daten, name: h.bezeichnung, verkehrswertQuelle: h.verkehrswerte[0]?.quelle ?? null }] : [];
    }),
    kredite: g.kredite.flatMap((k) => {
      const daten = grundlage.kredite.find((x) => x.id === k.id);
      return daten
        ? [{
            daten,
            name: k.bezeichnung,
            bank: k.bank,
            covenants: k.covenants.map((c) => ({ kennzahl: c.kennzahl, vergleich: c.vergleich, schwellenwert: c.schwellenwert ? dezimal(c.schwellenwert) : null, folge: c.folge })),
          }]
        : [];
    }),
    alleHaeuser: grundlage.haeuser,
    alleKredite: grundlage.kredite,
    referenzwerte: grundlage.referenzwerte,
    geschaeftsjahre,
    dokumente,
    waterfall: {
      vorzugsrenditeProzent: g.waterfallvertrag ? dezimal(g.waterfallvertrag.vorzugsrenditeProzent) : null,
      vertragQuelle: g.waterfallvertrag?.quelle ?? null,
      gesellschafter: g.gesellschafter.length,
      ohneEinlage: g.gesellschafter.filter((x) => !x.bewegungen.some((b) => b.art === "EINLAGE")).length,
      einlagenOhneDatum: einlagen.filter((b) => b.datum === null).length,
      ohneGewinnanteil: g.gesellschafter.filter((x) => x.gewinnanteilProzent === null).length,
    },
  };
  return baueDatenpaket(eingabe, texte(kontext.mandant.sprache), formatierer(kontext.mandant));
}
