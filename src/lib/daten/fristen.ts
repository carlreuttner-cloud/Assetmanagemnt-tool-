import "server-only";
import { bereichsSicht } from "@/lib/auth/auswahl";
import type { Kontext } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { isoDatum } from "@/lib/datum";
import { dezimal, formatProzent } from "@/lib/geld";
import type { FristEingabe } from "@/lib/fristen";
import { erlaubt } from "./portfolio";

/** Grundlage des Fristen-Kalenders in der gewählten Ansicht; Kredite und Mieter nur mit Leserecht. */
export async function ladeFristEingabe(kontext: Kontext): Promise<FristEingabe & { gesellschaften: Array<{ id: string; name: string }> }> {
  const sicht = await bereichsSicht(kontext);
  const mitKrediten = darf(kontext.rolle, "gesellschaften");
  const mitMietern = darf(kontext.rolle, "mieter");
  const [gesellschaften, kredite, mvs] = await Promise.all([
    kontext.db.gesellschaft.findMany({ where: { id: erlaubt(sicht.gesellschaftIds) }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    mitKrediten
      ? kontext.db.kredit.findMany({
          where: { gesellschaftId: erlaubt(sicht.gesellschaftIds) },
          select: {
            id: true,
            bezeichnung: true,
            zinsArt: true,
            zinsbindungBis: true,
            laufzeitBis: true,
            gesellschaft: { select: { id: true, name: true } },
            zinssicherungen: { select: { art: true, satz: true, ende: true } },
          },
        })
      : [],
    mitMietern
      ? kontext.db.mietverhaeltnis.findMany({
          where: { einheit: { hausId: erlaubt(sicht.hausIds) } },
          select: {
            id: true,
            beginn: true,
            ende: true,
            letzteMieterhoehung: true,
            mieter: { select: { name: true } },
            einheit: { select: { bezeichnung: true, art: true, haus: { select: { bezeichnung: true, gesellschaftId: true } } } },
          },
        })
      : [],
  ]);
  return {
    gesellschaften,
    kredite: kredite.map((k) => ({
      id: k.id,
      bezeichnung: k.bezeichnung,
      gesellschaftId: k.gesellschaft.id,
      gesellschaft: k.gesellschaft.name,
      zinsArt: k.zinsArt,
      zinsbindungBis: isoDatum(k.zinsbindungBis),
      laufzeitBis: isoDatum(k.laufzeitBis),
      sicherungen: k.zinssicherungen.map((s) => ({ art: s.art === "CAP" ? "Cap" : "Swap", satz: formatProzent(dezimal(s.satz), { sprache: kontext.mandant.sprache }), ende: isoDatum(s.ende) })),
    })),
    mietverhaeltnisse: mvs.map((m) => ({
      id: m.id,
      mieter: m.mieter.name,
      einheit: m.einheit.bezeichnung,
      einheitArt: m.einheit.art,
      haus: m.einheit.haus.bezeichnung,
      gesellschaftId: m.einheit.haus.gesellschaftId,
      beginn: isoDatum(m.beginn),
      ende: isoDatum(m.ende),
      letzteMieterhoehung: isoDatum(m.letzteMieterhoehung),
    })),
  };
}
