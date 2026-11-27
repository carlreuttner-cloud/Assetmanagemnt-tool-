/**
 * Frei erfundene Investitionsmaßnahmen zu den Test-Investitionen eines Hauses.
 *
 * Jede Investition wird zur Kostenposition einer Maßnahme mit Budget (85–110 % der Kosten).
 * Mehrmiete: Heizung, Fenster und Aufzug erwartet (8 % der Kosten p. a.), Modernisierung Wohnung
 * belegt durch den neuen Mietvertrag, Dach und Fassade ohne Mehrmiete (Instandhaltung).
 * Bewusste Lücken: jede fünfte Maßnahme ohne Budget; bei Häusern mit ungerader Nummer bleibt die
 * letzte von mehreren Investitionen ohne Maßnahme; jedes dritte Haus hat eine geplante Maßnahme
 * ohne Ist-Kosten.
 */
import { aufCent, dezimal, type Decimal } from "../../src/lib/geld";
import { zufall } from "./hilfen";

export interface TestMassnahme {
  bezeichnung: string;
  kategorie: string;
  status: "GEPLANT" | "LAUFEND" | "ABGESCHLOSSEN";
  budget: Decimal | null;
  budgetQuelle: string | null;
  beginn: string | null;
  ende: string | null;
  mehrmieteMonat: Decimal | null;
  mehrmieteBelegt: boolean;
  mehrmieteQuelle: string | null;
  einheit: string | null;
}

type Inv = { datum: string; betrag: Decimal; kategorie: string; beschreibung: string; einheit: string | null };

export function baueMassnahmen(schluessel: string, investitionen: Inv[]): { massnahmen: TestMassnahme[]; zuordnung: Array<number | null> } {
  const z = zufall(`massnahmen-${schluessel}`);
  const nummer = Number(schluessel.replace(/\D/g, ""));
  const massnahmen: TestMassnahme[] = [];
  const zuordnung: Array<number | null> = [];
  investitionen.forEach((inv, i) => {
    if (nummer % 2 === 1 && investitionen.length > 1 && i === investitionen.length - 1) {
      zuordnung.push(null);
      return;
    }
    const laufend = inv.datum >= "2026-06-01";
    const mitBudget = (nummer + i) % 5 !== 0;
    const umlage = ["Heizung", "Fenster", "Aufzug"].includes(inv.kategorie);
    const wohnung = inv.kategorie === "Modernisierung Wohnung";
    massnahmen.push({
      bezeichnung: inv.beschreibung,
      kategorie: inv.kategorie,
      status: laufend ? "LAUFEND" : "ABGESCHLOSSEN",
      budget: mitBudget ? inv.betrag.times(z.ganz(85, 110)).dividedBy(100).dividedBy(1000).round().times(1000) : null,
      budgetQuelle: mitBudget ? `Gesellschafterbeschluss / Angebot ${inv.datum.slice(0, 4)} (Testdaten)` : null,
      beginn: inv.datum,
      ende: laufend ? null : inv.datum,
      mehrmieteMonat: umlage ? aufCent(inv.betrag.times("0.08").dividedBy(12)) : wohnung ? dezimal(z.ganz(15, 30) * 10) : dezimal(0),
      mehrmieteBelegt: wohnung,
      mehrmieteQuelle: umlage
        ? "Erwartet: Modernisierungsumlage 8 % p. a. (Testdaten)"
        : wohnung
          ? "Neuer Mietvertrag nach Modernisierung (Testdaten)"
          : "Instandhaltung, keine Mehrmiete (Testdaten)",
      einheit: inv.einheit,
    });
    zuordnung.push(massnahmen.length - 1);
  });
  if (nummer % 3 === 0) {
    const budget = dezimal(z.ganz(12, 25) * 10000);
    massnahmen.push({
      bezeichnung: "Balkonanbau Hofseite",
      kategorie: "Balkone",
      status: "GEPLANT",
      budget,
      budgetQuelle: "Kostenschätzung Architekt 2026 (Testdaten)",
      beginn: "2027-04-01",
      ende: null,
      mehrmieteMonat: aufCent(budget.times("0.05").dividedBy(12)),
      mehrmieteBelegt: false,
      mehrmieteQuelle: "Erwartet: 5 % p. a. auf das Budget laut Wirtschaftlichkeitsrechnung (Testdaten)",
      einheit: null,
    });
  }
  return { massnahmen, zuordnung };
}
