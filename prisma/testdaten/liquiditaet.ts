/**
 * Frei erfundene Daten für die Liquiditätsplanung je Test-Gesellschaft.
 *
 * - Kontostände: Geschäftskonto zum Vormonatsende und Monat davor, Tagesgeld mit älterem Stichtag.
 * - Mindestliquidität: drei Monatsmieten, G2 vier (wird unterschritten), G5 ohne Festlegung.
 * - Planpositionen: Bewirtschaftung monatlich (15 % der Miete), Grundsteuer quartalsweise,
 *   Versicherung im Januar, Ausschüttung im Juni.
 * Bewusst: G3 mit großer Ausschüttung und knappem Konto (Engpass), G4 ohne Kontostand (Bestand unbekannt).
 */
import { dezimal, type Decimal } from "../../src/lib/geld";
import { monatsanfang, monatsNummer } from "./hilfen";
import { STICHTAG, type TestPortfolio } from "./portfolio";

export interface TestLiquiditaet {
  gesellschaft: string;
  mindestliquiditaet: Decimal | null;
  kontostaende: { konto: string; stichtag: string; betrag: Decimal; quelle: string }[];
  positionen: { art: "AUSSCHUETTUNG" | "EINNAHME" | "AUSGABE"; monat: string; betrag: Decimal; bezeichnung: string; quelle: string }[];
}

export function baueLiquiditaet(p: TestPortfolio): TestLiquiditaet[] {
  const gesellschaften = [...new Set(p.haeuser.map((h) => h.gesellschaft))].sort();
  const start = monatsNummer(STICHTAG) + 1;
  return gesellschaften.map((g) => {
    const miete = p.haeuser
      .filter((h) => h.gesellschaft === g)
      .flatMap((h) => h.einheiten.flatMap((e) => e.mietverhaeltnisse))
      .filter((m) => m.beginn <= STICHTAG && (m.ende === null || m.ende >= STICHTAG))
      .reduce((s, m) => s.plus(m.istMiete), dezimal(0));
    const mal = (faktor: number | string) => miete.times(faktor).dividedBy(100).toDecimalPlaces(0).times(100);
    const positionen: TestLiquiditaet["positionen"] = [];
    for (let nr = start; nr < start + 14; nr++) {
      const monat = monatsanfang(nr);
      const m = (nr % 12) + 1;
      positionen.push({ art: "AUSGABE", monat, betrag: mal("0.15"), bezeichnung: "Bewirtschaftung (Verwaltung, Instandhaltung)", quelle: "Wirtschaftsplan 2027 (Test)" });
      if (m % 3 === 2) positionen.push({ art: "AUSGABE", monat, betrag: mal("0.12"), bezeichnung: "Grundsteuer", quelle: "Grundsteuerbescheid (Test)" });
      if (m === 1) positionen.push({ art: "AUSGABE", monat, betrag: mal("0.4"), bezeichnung: "Gebäudeversicherung", quelle: "Versicherungsschein (Test)" });
      if (m === 6) positionen.push({ art: "AUSSCHUETTUNG", monat, betrag: mal(g === "G3" ? 9 : 2), bezeichnung: "Ausschüttung an die Gesellschafter", quelle: "Gesellschafterbeschluss (Entwurf, Test)" });
    }
    const kontostaende: TestLiquiditaet["kontostaende"] =
      g === "G4"
        ? []
        : [
            { konto: "Geschäftskonto", stichtag: "2026-09-30", betrag: mal(g === "G3" ? "1.2" : "3.6"), quelle: "Kontoauszug 09/2026 (Test)" },
            { konto: "Geschäftskonto", stichtag: STICHTAG, betrag: mal(g === "G3" ? 1 : 4), quelle: "Kontoauszug 10/2026 (Test)" },
            { konto: "Tagesgeld", stichtag: "2026-09-30", betrag: mal(g === "G3" ? 0 : 3), quelle: "Jahreszinsbescheinigung (Test)" },
          ];
    return { gesellschaft: g, mindestliquiditaet: g === "G5" ? null : mal(g === "G2" ? 4 : 3), kontostaende, positionen };
  });
}
