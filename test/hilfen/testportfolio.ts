/**
 * Wandelt den Testdatensatz des Generators in die Eingabetypen der Rechenfunktionen um,
 * damit die App-Berechnungen gegen die Sollwerte des Generators geprüft werden können.
 */
import type { HausDaten } from "@/lib/kennzahlen";
import type { KreditDaten } from "@/lib/kredit";
import type { TestPortfolio } from "../../prisma/testdaten/portfolio";

export function alsDaten(p: TestPortfolio): { haeuser: HausDaten[]; kredite: KreditDaten[] } {
  const haeuser: HausDaten[] = p.haeuser.map((h) => ({
    id: h.schluessel,
    gesellschaftId: h.gesellschaft,
    kaufpreis: h.kaufpreis,
    verkehrswerte: h.verkehrswerte.map((v) => ({ stichtag: v.stichtag, wert: v.wert })),
    einheiten: h.einheiten.map((e, i) => ({
      id: `${h.schluessel}-${i}`,
      art: e.art,
      flaeche: e.flaeche,
      erwarteteMiete: e.erwarteteMiete,
      mietverhaeltnisse: e.mietverhaeltnisse.map((m) => ({
        beginn: m.beginn, ende: m.ende, istMiete: m.istMiete, sollMiete: m.sollMiete, rueckstand: m.rueckstand,
      })),
    })),
  }));
  const kredite: KreditDaten[] = p.kredite.map((k) => ({
    id: k.schluessel,
    gesellschaftId: k.gesellschaft,
    bezeichnung: k.bezeichnung,
    zinsArt: k.zinsArt,
    sollzins: k.sollzins,
    referenzzins: k.referenzzins,
    marge: k.marge,
    ursprungsbetrag: k.ursprungsbetrag,
    auszahlungsdatum: k.auszahlungsdatum,
    zinsbindungBis: k.zinsbindungBis,
    laufzeitBis: k.laufzeitBis,
    zahlweise: k.zahlweise,
    tilgungsart: k.tilgungsart,
    anfaenglicheTilgung: k.anfaenglicheTilgung,
    ratenbetrag: k.ratenbetrag,
    haeuser: k.haeuser.map((x) => ({ hausId: x.haus, anteilProzent: x.anteilProzent })),
    buchungen: k.buchungen.map((b) => ({ datum: b.datum, art: b.art, betrag: b.betrag, saldoNach: b.saldoNach })),
    salden: k.salden,
    tilgungsplaene: k.tilgungsplaene.map((t) => ({ version: t.version, gueltigAb: t.gueltigAb, zeilen: t.zeilen })),
  }));
  return { haeuser, kredite };
}
