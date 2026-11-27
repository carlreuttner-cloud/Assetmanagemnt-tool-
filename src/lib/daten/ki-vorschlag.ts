import "server-only";
import { texte } from "@/i18n";
import type { Kontext } from "@/lib/auth/kontext";
import { heute, isoDatum } from "@/lib/datum";
import { formatierer } from "@/lib/format";
import { dezimal } from "@/lib/geld";
import { baueVorschlagPaket, type VorschlagPaket } from "@/lib/ki-vorschlag";
import { ladeRechengrundlage } from "./portfolio";

/**
 * Datenpaket für einen KI-Vorschlag zu einem Haus am heutigen Stichtag. null, wenn das Haus
 * nicht existiert oder in der Ansicht nicht sichtbar ist.
 */
export async function ladeVorschlagPaket(kontext: Kontext, hausId: string): Promise<VorschlagPaket | null> {
  const stichtag = heute();
  const grundlage = await ladeRechengrundlage(kontext, { bereich: true });
  const daten = grundlage.haeuser.find((h) => h.id === hausId);
  if (!daten) return null;
  const haus = await kontext.db.haus.findFirst({
    where: { id: hausId },
    select: {
      id: true,
      bezeichnung: true,
      kaufpreis: true,
      kaufdatum: true,
      gesellschaft: { select: { id: true, name: true } },
      einheiten: {
        orderBy: { bezeichnung: "asc" },
        select: {
          id: true,
          bezeichnung: true,
          art: true,
          flaeche: true,
          erwarteteMiete: true,
          mietverhaeltnisse: { select: { beginn: true, ende: true, sollMiete: true, istMiete: true, letzteMieterhoehung: true } },
        },
      },
      verkehrswerte: { select: { stichtag: true, wert: true, quelle: true, gutachten: { select: { gutachter: true, rohertragJahr: true } } } },
      investitionen: { select: { datum: true, betrag: true } },
      exitrechnungen: { orderBy: { geaendertAm: "desc" }, take: 5, select: { name: true, geaendertAm: true, maklerProzent: true, sonstigeProzent: true, vfeProzent: true, faktor: true, preisBasis: true } },
    },
  });
  if (!haus) return null;
  const d = (w: { toFixed(): string } | null) => (w === null ? null : dezimal(w));

  return baueVorschlagPaket(
    {
      stichtag,
      haus: { id: haus.id, name: haus.bezeichnung, gesellschaftId: haus.gesellschaft.id, gesellschaft: haus.gesellschaft.name, kaufpreis: d(haus.kaufpreis), kaufdatum: isoDatum(haus.kaufdatum) },
      daten,
      einheiten: haus.einheiten.map((u) => ({
        id: u.id,
        bezeichnung: u.bezeichnung,
        art: u.art,
        flaeche: dezimal(u.flaeche),
        erwarteteMiete: d(u.erwarteteMiete),
        vertraege: u.mietverhaeltnisse.map((m) => ({
          beginn: isoDatum(m.beginn),
          ende: isoDatum(m.ende),
          sollMiete: dezimal(m.sollMiete),
          istMiete: dezimal(m.istMiete),
          letzteMieterhoehung: isoDatum(m.letzteMieterhoehung),
        })),
      })),
      werte: haus.verkehrswerte.map((v) => ({
        stichtag: isoDatum(v.stichtag),
        wert: dezimal(v.wert),
        quelle: v.quelle,
        gutachten: v.gutachten ? { gutachter: v.gutachten.gutachter, rohertragJahr: d(v.gutachten.rohertragJahr) } : null,
      })),
      kredite: grundlage.kredite.filter((k) => k.haeuser.some((h) => h.hausId === hausId)).map((k) => ({ daten: k, name: k.bezeichnung })),
      referenzwerte: grundlage.referenzwerte,
      investitionen: haus.investitionen.map((i) => ({ datum: isoDatum(i.datum), betrag: dezimal(i.betrag) })),
      exitrechnungen: haus.exitrechnungen.map((r) => ({
        name: r.name,
        geaendertAm: isoDatum(r.geaendertAm),
        maklerProzent: dezimal(r.maklerProzent),
        sonstigeProzent: dezimal(r.sonstigeProzent),
        vfeProzent: d(r.vfeProzent),
        faktor: d(r.faktor),
        preisBasis: r.preisBasis,
      })),
    },
    texte(kontext.mandant.sprache),
    formatierer(kontext.mandant),
  );
}
