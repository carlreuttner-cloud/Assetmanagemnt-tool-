/**
 * Frei erfundene Finanzzahlen der Testgesellschaften für die Geschäftsjahre 2021 bis 2025.
 *
 * Herleitung (in sich stimmig, damit die rechnerischen Kontrollen aufgehen):
 * - Umsatzerlöse = Soll-Jahresnettokaltmiete der Häuser im Bestand (Kaufpreis ÷ Kaufpreisfaktor),
 *   je Jahr vor 2025 um 2 % niedriger.
 * - Aufwand: Bewirtschaftung 14–18 %, sonstige Aufwendungen 3–5 % der Umsatzerlöse.
 * - Abschreibung 2 % auf 80 % des Kaufpreises (Gebäudeanteil).
 * - Verbindlichkeiten gegenüber Kreditinstituten = Summe der belegten Kreditsalden zum 31.12.
 * - Zinsaufwand ≈ durchschnittliche Restschuld × Sollzins (variabel: 3,5 %).
 * - Eigenkapital ergibt sich als Rest der Bilanz; der Finanzierungs-Cashflow so, dass die
 *   Kapitalflussrechnung die Veränderung der liquiden Mittel erklärt.
 *
 * Bewusst eingebaute Sonderfälle: G2 ohne Geschäftsjahr 2022 (Lücke), G1 und G3 mit Entwurf 2025,
 * G5 2025 nur als BWA (ohne Bilanz), G4 ohne Kapitalflussrechnung 2021 und 2022,
 * G3 2024 mit einer kleinen Abweichung zwischen Bilanz und Kreditsalden.
 */
import { aufCent, dezimal, type Decimal } from "../../src/lib/geld";
import { zufall } from "./hilfen";
import type { TestKredit } from "./kredite";
import { HAUS_VORGABEN, type TestGesellschaft, type TestHaus } from "./portfolio";

export interface TestGeschaeftsjahr {
  gesellschaft: string;
  jahr: number;
  quelle: "JAHRESABSCHLUSS" | "BWA" | "SONSTIGE";
  quelleText: string;
  status: "ENDGUELTIG" | "ENTWURF";
  werte: Record<string, Decimal | null>;
}

const JAHRE = [2021, 2022, 2023, 2024, 2025];

export function baueFinanzen(gesellschaften: readonly TestGesellschaft[], haeuser: TestHaus[], kredite: TestKredit[]): TestGeschaeftsjahr[] {
  const ergebnis: TestGeschaeftsjahr[] = [];
  for (const g of gesellschaften) {
    const z = zufall(`finanzen-${g.schluessel}`);
    const eigene = haeuser.filter((h) => h.gesellschaft === g.schluessel);
    const eigeneKredite = kredite.filter((k) => k.gesellschaft === g.schluessel);
    const anteilBewirtschaftung = dezimal(z.ganz(14, 18));
    const anteilSonstige = dezimal(z.ganz(3, 5));
    const personal = g.rechtsform.includes("KG") ? dezimal(0) : dezimal(z.ganz(30, 90)).times(1000);

    const schuld = (jahr: number) =>
      eigeneKredite.reduce((s, k) => {
        if (k.auszahlungsdatum > `${jahr}-12-31`) return s;
        const saldo = k.salden.find((x) => x.stichtag === `${jahr}-12-31` && x.art === "DARLEHEN");
        // Fehlt ein Saldo (bewusste Lücke im Testkredit), nimmt der Abschluss den Vorjahressaldo.
        const ersatz = k.salden.find((x) => x.stichtag === `${jahr - 1}-12-31` && x.art === "DARLEHEN");
        return s.plus(saldo?.betrag ?? ersatz?.betrag ?? k.ursprungsbetrag);
      }, dezimal(0));
    const zinssatz = (k: TestKredit) => (k.sollzins ?? dezimal("3.5")).dividedBy(100);

    let liquideVorjahr = dezimal(z.ganz(150, 400)).times(1000);
    for (const jahr of JAHRE) {
      const ende = `${jahr}-12-31`;
      const bestand = eigene.filter((h) => h.kaufdatum <= ende);
      if (bestand.length === 0) continue;
      const faktorJahr = dezimal("0.98").pow(2025 - jahr);
      const umsatz = aufCent(
        bestand.reduce((s, h) => {
          const v = HAUS_VORGABEN.find((x) => x.schluessel === h.schluessel)!;
          // Im Kaufjahr nur anteilig ab dem Kaufmonat.
          const monate = h.kaufdatum.startsWith(String(jahr)) ? 12 - Number(h.kaufdatum.slice(5, 7)) + 1 : 12;
          return s.plus(h.kaufpreis.dividedBy(dezimal(v.faktor).dividedBy(10)).times(monate).dividedBy(12));
        }, dezimal(0)).times(faktorJahr),
      );
      const sonstigeErtraege = dezimal(z.ganz(2, 25)).times(1000);
      const materialaufwand = aufCent(umsatz.times(anteilBewirtschaftung).dividedBy(100));
      const sonstigeAufwendungen = aufCent(umsatz.times(anteilSonstige).dividedBy(100));
      const kaufpreise = bestand.reduce((s, h) => s.plus(h.kaufpreis), dezimal(0));
      const abschreibungen = aufCent(kaufpreise.times("0.8").times("0.02"));
      const zinsaufwendungen = aufCent(
        eigeneKredite
          .filter((k) => k.auszahlungsdatum <= ende)
          .reduce((s, k) => {
            const anfang = k.salden.find((x) => x.stichtag === `${jahr - 1}-12-31` && x.art === "DARLEHEN")?.betrag ?? k.ursprungsbetrag;
            return s.plus(anfang.times(zinssatz(k)).times("0.99"));
          }, dezimal(0)),
      );
      const zinsertraege = dezimal(z.ganz(0, 6)).times(500);
      const ebt = umsatz.plus(sonstigeErtraege).minus(materialaufwand).minus(personal).minus(sonstigeAufwendungen).minus(abschreibungen).plus(zinsertraege).minus(zinsaufwendungen);
      const steuern = ebt.greaterThan(0) ? aufCent(ebt.times(g.rechtsform.includes("KG") ? "0.14" : "0.158")) : dezimal(0);
      const jahresergebnis = ebt.minus(steuern);

      // Bilanz
      const afaKumuliert = bestand.reduce((s, h) => {
        const jahreImBestand = Math.max(0, jahr - Number(h.kaufdatum.slice(0, 4)) + 1);
        return s.plus(h.kaufpreis.times("0.8").times("0.02").times(jahreImBestand));
      }, dezimal(0));
      const investitionen = eigene.flatMap((h) => h.investitionen).filter((i) => i.datum <= ende);
      const anlagevermoegen = aufCent(kaufpreise.minus(afaKumuliert).plus(investitionen.reduce((s, i) => s.plus(i.betrag), dezimal(0))));
      const liquideMittel = dezimal(z.ganz(150, 900)).times(1000);
      const umlaufvermoegen = aufCent(umsatz.times(dezimal(z.ganz(10, 30))).dividedBy(1000));
      const rueckstellungen = dezimal(z.ganz(20, 80)).times(1000);
      const sonstigeVerbindlichkeiten = aufCent(umsatz.times(dezimal(z.ganz(20, 60))).dividedBy(1000));
      let verbindlichkeitenBanken = schuld(jahr);
      if (g.schluessel === "G3" && jahr === 2024) verbindlichkeitenBanken = verbindlichkeitenBanken.plus("12480.55");
      const eigenkapital = anlagevermoegen.plus(umlaufvermoegen).plus(liquideMittel).minus(rueckstellungen).minus(verbindlichkeitenBanken).minus(sonstigeVerbindlichkeiten);

      // Kapitalflussrechnung
      const cashflowLaufend = aufCent(jahresergebnis.plus(abschreibungen).plus(dezimal(z.ganz(-20, 20)).times(1000)));
      const kaeufe = bestand.filter((h) => h.kaufdatum.startsWith(String(jahr))).reduce((s, h) => s.plus(h.kaufpreis), dezimal(0));
      const invJahr = investitionen.filter((i) => i.datum.startsWith(String(jahr))).reduce((s, i) => s.plus(i.betrag), dezimal(0));
      const cashflowInvestition = kaeufe.plus(invJahr).negated();
      const cashflowFinanzierung = liquideMittel.minus(liquideVorjahr).minus(cashflowLaufend).minus(cashflowInvestition);
      liquideVorjahr = liquideMittel;

      // Sonderfälle
      if (g.schluessel === "G2" && jahr === 2022) continue;
      const entwurf = jahr === 2025 && (g.schluessel === "G1" || g.schluessel === "G3");
      const bwa = jahr === 2025 && g.schluessel === "G5";
      const ohneCashflow = g.schluessel === "G4" && jahr <= 2022;
      const werte: Record<string, Decimal | null> = {
        umsatzerloese: umsatz, sonstigeErtraege, materialaufwand, personalaufwand: personal, sonstigeAufwendungen, abschreibungen,
        zinsertraege, zinsaufwendungen, steuern, jahresergebnis,
        anlagevermoegen, umlaufvermoegen, liquideMittel, eigenkapital, rueckstellungen, verbindlichkeitenBanken, sonstigeVerbindlichkeiten,
        cashflowLaufend, cashflowInvestition, cashflowFinanzierung,
      };
      if (bwa || ohneCashflow) for (const p of ["cashflowLaufend", "cashflowInvestition", "cashflowFinanzierung"]) werte[p] = null;
      if (bwa) {
        for (const p of ["anlagevermoegen", "umlaufvermoegen", "liquideMittel", "eigenkapital", "rueckstellungen", "verbindlichkeitenBanken", "sonstigeVerbindlichkeiten", "steuern", "jahresergebnis"]) werte[p] = null;
      }
      ergebnis.push({
        gesellschaft: g.schluessel,
        jahr,
        quelle: bwa ? "BWA" : "JAHRESABSCHLUSS",
        quelleText: bwa ? `BWA Dezember ${jahr} (Testdaten)` : entwurf ? `Jahresabschluss ${jahr}, Entwurf des Steuerbüros (Testdaten)` : `Festgestellter Jahresabschluss ${jahr} (Testdaten)`,
        status: entwurf || bwa ? "ENTWURF" : "ENDGUELTIG",
        werte,
      });
    }
  }
  return ergebnis;
}
