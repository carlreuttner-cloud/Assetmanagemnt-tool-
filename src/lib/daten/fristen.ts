import "server-only";
import { bereichsSicht } from "@/lib/auth/auswahl";
import type { Kontext } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { heute, isoDatum } from "@/lib/datum";
import { dezimal, formatProzent } from "@/lib/geld";
import type { FristEingabe } from "@/lib/fristen";
import { texte, type Texte } from "@/i18n";
import { formatierer, type Formatierer } from "@/lib/format";
import { erlaubt } from "./portfolio";
import { ladeKapitalabrufe } from "./kapitalabruf";
import { SONDERTILGUNG_FELDER, sondertilgungAusDb } from "./sondertilgung";
import { laufendesJahr, sondertilgung, sondertilgungRegel } from "@/lib/sondertilgung";

/** Laufendes Sondertilgungsjahr mit offenem Betrag für den Kalender. */
function sondertilgungFrist(k: Parameters<typeof sondertilgungAusDb>[0], stichtag: string, t: Texte, f: Formatierer) {
  const eingabe = sondertilgungAusDb(k);
  const erg = sondertilgung(eingabe, stichtag);
  if (erg.art === "unbekannt") return erg.grund === "recht" ? ("unbekannt" as const) : null;
  const j = laufendesJahr(erg);
  if (!j || !j.offen.greaterThan(0)) return null;
  return { bis: j.bis, offen: f.betragGanz(j.offen), regel: sondertilgungRegel(eingabe, t.sondertilgung, f), uebertragbar: eingabe.uebertragbar };
}

/** Grundlage des Fristen-Kalenders in der gewählten Ansicht; Kredite und Mieter nur mit Leserecht. */
export async function ladeFristEingabe(kontext: Kontext): Promise<FristEingabe & { gesellschaften: Array<{ id: string; name: string }> }> {
  const sicht = await bereichsSicht(kontext);
  const t = texte(kontext.mandant.sprache);
  const f = formatierer(kontext.mandant);
  const stichtag = heute();
  const mitKrediten = darf(kontext.rolle, "gesellschaften");
  const mitMietern = darf(kontext.rolle, "mieter");
  const mitHaeusern = darf(kontext.rolle, "haeuser");
  const [gesellschaften, kredite, mvs, abrufe, ausweise] = await Promise.all([
    kontext.db.gesellschaft.findMany({ where: { id: erlaubt(sicht.gesellschaftIds) }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    mitKrediten
      ? kontext.db.kredit.findMany({
          where: { gesellschaftId: erlaubt(sicht.gesellschaftIds) },
          select: {
            id: true,
            bezeichnung: true,
            zinsArt: true,
            gesellschaft: { select: { id: true, name: true } },
            zinssicherungen: { select: { art: true, satz: true, ende: true } },
            covenants: { select: { kennzahl: true, vergleich: true, schwellenwert: true, ersterTest: true, testIntervallMonate: true } },
            ...SONDERTILGUNG_FELDER,
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
    mitKrediten ? ladeKapitalabrufe(kontext) : [],
    mitHaeusern
      ? kontext.db.haus.findMany({
          where: { id: erlaubt(sicht.hausIds), energieausweise: { some: { gueltigBis: { not: null } } } },
          select: {
            id: true,
            bezeichnung: true,
            gesellschaft: { select: { id: true, name: true } },
            energieausweise: { where: { gueltigBis: { not: null } }, orderBy: { gueltigBis: "desc" }, take: 1, select: { gueltigBis: true, art: true, energieklasse: true } },
          },
        })
      : [],
  ]);
  return {
    energieausweise: ausweise.map((h) => ({
      hausId: h.id,
      haus: h.bezeichnung,
      gesellschaftId: h.gesellschaft.id,
      gesellschaft: h.gesellschaft.name,
      gueltigBis: isoDatum(h.energieausweise[0].gueltigBis)!,
      art: t.energie.arten[h.energieausweise[0].art],
      klasse: h.energieausweise[0].energieklasse ?? t.energie.unbekannteKlasse,
    })),
    kapitalabrufe: abrufe
      .filter((a) => a.stand.offen.greaterThan(0))
      .map((a) => ({
        id: a.id,
        bezeichnung: a.bezeichnung,
        gesellschaftId: a.gesellschaftId,
        gesellschaft: a.gesellschaft,
        faelligAm: a.faelligAm,
        offen: f.betragGanz(a.stand.offen),
        betrag: f.betragGanz(a.stand.betrag),
        offeneGesellschafter: a.positionen.filter((p) => p.stand.offen.greaterThan(0)).length,
      })),
    gesellschaften,
    kredite: kredite.map((k) => ({
      id: k.id,
      bezeichnung: k.bezeichnung,
      gesellschaftId: k.gesellschaft.id,
      gesellschaft: k.gesellschaft.name,
      zinsArt: k.zinsArt,
      zinsbindungBis: isoDatum(k.zinsbindungBis),
      laufzeitBis: isoDatum(k.laufzeitBis),
      covenants: k.covenants.map((c) => ({
        kennzahl: c.kennzahl,
        bedingung:
          c.vergleich && c.schwellenwert !== null
            ? `${t.vergleiche[c.vergleich]} ${c.kennzahl.toUpperCase() === "LTV" ? f.prozent(dezimal(c.schwellenwert), 1) : f.faktor(dezimal(c.schwellenwert))}`
            : "",
        ersterTest: isoDatum(c.ersterTest),
        intervallMonate: c.testIntervallMonate,
      })),
      sondertilgung: sondertilgungFrist(k, stichtag, t, f),
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
