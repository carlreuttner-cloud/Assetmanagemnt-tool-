/**
 * Frei erfundene Gesellschafter, Einlagen und Verteilungsregeln für den Verkaufs-Waterfall.
 *
 * Einlagen: 25 % des Kaufpreises je Haus zum Kaufdatum, aufgeteilt nach Kapitalbeteiligung.
 * Ausschüttungen: jährlich 2 % der Einlagen ab 2022 (nicht bei G4).
 * Bewusste Lücken: G2 ohne Verteilungsregeln, G3 mit einer Einlage ohne Datum,
 * G4 mit einem Gesellschafter ohne Einlagen und ohne Gewinnanteil.
 */
import { aufCent, dezimal, type Decimal } from "../../src/lib/geld";
import type { TestHaus } from "./portfolio";

export interface TestGesellschafter {
  gesellschaft: string;
  name: string;
  beteiligungProzent: Decimal | null;
  gewinnanteilProzent: Decimal | null;
  bewegungen: { art: "EINLAGE" | "RUECKZAHLUNG" | "AUSSCHUETTUNG"; datum: string | null; betrag: Decimal; quelle: string }[];
}

export interface TestWaterfallvertrag {
  gesellschaft: string;
  vorzugsrenditeProzent: Decimal;
  verzinsung: "EINFACH" | "ZINSESZINS";
  ausschuettungenAnrechnen: boolean;
  quelle: string;
}

const VORGABEN: Record<string, { partner: Array<[string, number, number | null]>; vertrag: [number, "EINFACH" | "ZINSESZINS"] | null }> = {
  G1: { partner: [["Investorengruppe Linde (Testdaten)", 90, 80], ["Lindenhof Verwaltungs GmbH (Testdaten)", 10, 20]], vertrag: [6, "EINFACH"] },
  G2: { partner: [["Familie Rheinberg (Testdaten)", 60, 60], ["Rheinblick Holding GmbH (Testdaten)", 40, 40]], vertrag: null },
  G3: { partner: [["Elbe Pensionsfonds (Testdaten)", 85, 75], ["Elbufer Asset GmbH (Testdaten)", 15, 25]], vertrag: [7, "ZINSESZINS"] },
  G4: { partner: [["Isar Family Office (Testdaten)", 70, 70], ["Isartal Projekt GmbH (Testdaten)", 30, null]], vertrag: [5, "EINFACH"] },
  G5: { partner: [["Main Invest KG (Testdaten)", 95, 80], ["Mainhaus Management GmbH (Testdaten)", 5, 20]], vertrag: [8, "EINFACH"] },
};

export function baueWaterfall(haeuser: TestHaus[]): { gesellschafter: TestGesellschafter[]; vertraege: TestWaterfallvertrag[] } {
  const gesellschafter: TestGesellschafter[] = [];
  const vertraege: TestWaterfallvertrag[] = [];
  for (const [schluessel, v] of Object.entries(VORGABEN)) {
    const eigene = haeuser.filter((h) => h.gesellschaft === schluessel);
    v.partner.forEach(([name, beteiligung, gewinn], i) => {
      const anteil = dezimal(beteiligung).dividedBy(100);
      const bewegungen: TestGesellschafter["bewegungen"] = [];
      const ohneEinlagen = schluessel === "G4" && i === 1;
      if (!ohneEinlagen) {
        for (const h of eigene) {
          bewegungen.push({
            art: "EINLAGE",
            datum: schluessel === "G3" && i === 0 && h === eigene[eigene.length - 1] ? null : h.kaufdatum,
            betrag: aufCent(h.kaufpreis.times("0.25").times(anteil)),
            quelle: `Einzahlungsbeleg zum Erwerb ${h.bezeichnung} (Testdaten)`,
          });
        }
        const einlagen = bewegungen.reduce((s, b) => s.plus(b.betrag), dezimal(0));
        if (schluessel !== "G4") {
          for (const jahr of [2022, 2023, 2024, 2025]) {
            bewegungen.push({ art: "AUSSCHUETTUNG", datum: `${jahr}-06-30`, betrag: aufCent(einlagen.times("0.02")), quelle: `Gesellschafterbeschluss ${jahr} (Testdaten)` });
          }
        }
        if (schluessel === "G5") bewegungen.push({ art: "RUECKZAHLUNG", datum: "2024-12-15", betrag: aufCent(einlagen.times("0.1")), quelle: "Kapitalrückzahlung nach Refinanzierung (Testdaten)" });
      }
      gesellschafter.push({
        gesellschaft: schluessel,
        name,
        beteiligungProzent: dezimal(beteiligung),
        gewinnanteilProzent: gewinn === null ? null : dezimal(gewinn),
        bewegungen,
      });
    });
    if (v.vertrag) {
      vertraege.push({
        gesellschaft: schluessel,
        vorzugsrenditeProzent: dezimal(v.vertrag[0]),
        verzinsung: v.vertrag[1],
        ausschuettungenAnrechnen: true,
        quelle: "Gesellschaftsvertrag § 14 Ergebnisverteilung bei Veräußerung (Testdaten)",
      });
    }
  }
  return { gesellschafter, vertraege };
}
