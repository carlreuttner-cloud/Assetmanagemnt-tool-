/**
 * Investitionsmaßnahmen: Budget, Ist-Kosten, Abweichung und Rendite aus Mehrmiete. Reine Funktionen.
 *
 * Gespeichert ist nur die monatliche Mehrmiete (netto kalt); die Jahresmehrmiete wird mit
 * jahresNettokaltmiete() berechnet. Fehlende Werte bleiben unbekannt (null), nichts wird geschätzt.
 */
import { dezimal, type Decimal } from "./geld";
import { jahresNettokaltmiete } from "./miete";

export type MassnahmeDaten = {
  status: "GEPLANT" | "LAUFEND" | "ABGESCHLOSSEN";
  budget: Decimal | null;
  mehrmieteMonat: Decimal | null;
  /** Beträge der zugeordneten Kostenpositionen */
  kosten: Decimal[];
};

export type MassnahmeAuswertung = {
  /** Summe der Kostenpositionen; null, wenn keine erfasst ist */
  ist: Decimal | null;
  /** Ist − Budget */
  abweichung: Decimal | null;
  abweichungProzent: Decimal | null;
  mehrmieteJahr: Decimal | null;
  /** Jahresmehrmiete ÷ Kostenbasis × 100 */
  rendite: Decimal | null;
  /** Kostenbasis ÷ Jahresmehrmiete */
  amortisationJahre: Decimal | null;
  /** Ist-Kosten bei abgeschlossenen Maßnahmen, sonst das Budget (Plan) */
  basis: "ist" | "budget" | null;
  basisWert: Decimal | null;
};

export function werteMassnahmeAus(m: MassnahmeDaten): MassnahmeAuswertung {
  const ist = m.kosten.length > 0 ? m.kosten.reduce((s, k) => s.plus(k), dezimal(0)) : null;
  const abweichung = ist !== null && m.budget !== null ? ist.minus(m.budget) : null;
  const mehrmieteJahr = m.mehrmieteMonat === null ? null : jahresNettokaltmiete(m.mehrmieteMonat);
  const basis: MassnahmeAuswertung["basis"] = m.status === "ABGESCHLOSSEN" ? (ist !== null ? "ist" : null) : m.budget !== null ? "budget" : null;
  const basisWert = basis === "ist" ? ist : basis === "budget" ? m.budget : null;
  const rechenbar = mehrmieteJahr !== null && basisWert !== null && !basisWert.isZero();
  return {
    ist,
    abweichung,
    abweichungProzent: abweichung !== null && m.budget !== null && !m.budget.isZero() ? abweichung.dividedBy(m.budget).times(100) : null,
    mehrmieteJahr,
    rendite: rechenbar ? mehrmieteJahr!.dividedBy(basisWert!).times(100) : null,
    amortisationJahre: rechenbar && !mehrmieteJahr!.isZero() ? basisWert!.dividedBy(mehrmieteJahr!) : null,
    basis,
    basisWert,
  };
}

export type MassnahmenSumme = {
  budget: Decimal;
  budgetUnbekannt: number;
  ist: Decimal;
  /** Abweichung nur über Maßnahmen mit Budget und Ist-Kosten */
  abweichung: Decimal | null;
  vergleichbar: number;
  mehrmieteJahr: Decimal;
  mehrmieteUnbekannt: number;
  anzahl: number;
};

export function summiereMassnahmen(liste: Array<{ m: MassnahmeDaten; a: MassnahmeAuswertung }>): MassnahmenSumme {
  const vergleichbar = liste.filter(({ a }) => a.abweichung !== null);
  return {
    budget: liste.reduce((s, { m }) => (m.budget ? s.plus(m.budget) : s), dezimal(0)),
    budgetUnbekannt: liste.filter(({ m }) => m.budget === null).length,
    ist: liste.reduce((s, { a }) => (a.ist ? s.plus(a.ist) : s), dezimal(0)),
    abweichung: vergleichbar.length > 0 ? vergleichbar.reduce((s, { a }) => s.plus(a.abweichung!), dezimal(0)) : null,
    vergleichbar: vergleichbar.length,
    mehrmieteJahr: liste.reduce((s, { a }) => (a.mehrmieteJahr ? s.plus(a.mehrmieteJahr) : s), dezimal(0)),
    mehrmieteUnbekannt: liste.filter(({ a }) => a.mehrmieteJahr === null).length,
    anzahl: liste.length,
  };
}
