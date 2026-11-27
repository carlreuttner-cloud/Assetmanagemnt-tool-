/**
 * Finanzen der Gesellschaften je Geschäftsjahr: abgeleitete Größen aus GuV, Bilanz und
 * Kapitalflussrechnung. Reine Funktionen.
 *
 * Regeln: Fehlt ein Posten, ist jede Größe, die ihn braucht, unbekannt (null) – nie 0.
 * Entwürfe werden berechnet, aber in der Ansicht als Entwurf gekennzeichnet.
 *
 * EBITDA = Umsatzerlöse + sonstige Erträge − Materialaufwand − Personalaufwand − sonstige Aufwendungen
 * EBIT   = EBITDA − Abschreibungen
 * EBT    = EBIT + Zinserträge − Zinsaufwendungen
 * Jahresergebnis rechnerisch = EBT − Steuern
 */
import { dezimal, type Decimal } from "./geld";
import type { IsoDatum } from "./datum";
import type { KreditDaten } from "./kredit";

export type AbschlussStatus = "ENDGUELTIG" | "ENTWURF";
export type AbschlussQuelle = "JAHRESABSCHLUSS" | "BWA" | "SONSTIGE";

export const GUV_POSTEN = [
  "umsatzerloese",
  "sonstigeErtraege",
  "materialaufwand",
  "personalaufwand",
  "sonstigeAufwendungen",
  "abschreibungen",
  "zinsertraege",
  "zinsaufwendungen",
  "steuern",
  "jahresergebnis",
] as const;
export const BILANZ_POSTEN = [
  "anlagevermoegen",
  "umlaufvermoegen",
  "liquideMittel",
  "eigenkapital",
  "rueckstellungen",
  "verbindlichkeitenBanken",
  "sonstigeVerbindlichkeiten",
] as const;
export const CASHFLOW_POSTEN = ["cashflowLaufend", "cashflowInvestition", "cashflowFinanzierung"] as const;
export const ALLE_POSTEN = [...GUV_POSTEN, ...BILANZ_POSTEN, ...CASHFLOW_POSTEN] as const;
export type Posten = (typeof ALLE_POSTEN)[number];

export type JahresDaten = {
  id: string;
  jahr: number;
  beginn: IsoDatum;
  ende: IsoDatum;
  quelle: AbschlussQuelle;
  quelleText: string | null;
  status: AbschlussStatus;
} & Record<Posten, Decimal | null>;

/** Summe mit Vorzeichen; null, sobald ein Teil fehlt. */
function rechne(teile: Array<[1 | -1, Decimal | null]>): Decimal | null {
  let s = dezimal(0);
  for (const [v, w] of teile) {
    if (w === null) return null;
    s = v === 1 ? s.plus(w) : s.minus(w);
  }
  return s;
}

const quote = (zaehler: Decimal | null, nenner: Decimal | null, mal = 100) =>
  zaehler === null || nenner === null || nenner.isZero() ? null : zaehler.dividedBy(nenner).times(mal);

export interface JahresKennzahlen {
  ebitda: Decimal | null;
  ebit: Decimal | null;
  ebt: Decimal | null;
  jahresergebnisRechnerisch: Decimal | null;
  /** erfasstes − rechnerisches Jahresergebnis */
  ergebnisAbweichung: Decimal | null;
  aktiva: Decimal | null;
  passiva: Decimal | null;
  /** Aktiva − Passiva (0 = Bilanz geht auf) */
  bilanzDifferenz: Decimal | null;
  eigenkapitalquote: Decimal | null;
  ebitdaMarge: Decimal | null;
  /** EBITDA ÷ Zinsaufwendungen */
  zinsdeckung: Decimal | null;
  /** Verbindlichkeiten gegenüber Kreditinstituten − liquide Mittel */
  nettoverschuldung: Decimal | null;
  /** Nettoverschuldung ÷ EBITDA (in Jahren) */
  nettoverschuldungZuEbitda: Decimal | null;
  cashflowSumme: Decimal | null;
  /** Veränderung der liquiden Mittel zum Vorjahr laut Bilanz */
  liquiditaetsveraenderung: Decimal | null;
  /** Summe der Cashflows − Veränderung der liquiden Mittel (0 = stimmig) */
  cashflowDifferenz: Decimal | null;
  umsatzVeraenderung: Decimal | null;
  ebitdaVeraenderung: Decimal | null;
}

export function jahresKennzahlen(j: JahresDaten, vorjahr: JahresDaten | null): JahresKennzahlen {
  const ebitda = rechne([
    [1, j.umsatzerloese],
    [1, j.sonstigeErtraege],
    [-1, j.materialaufwand],
    [-1, j.personalaufwand],
    [-1, j.sonstigeAufwendungen],
  ]);
  const ebit = rechne([
    [1, ebitda],
    [-1, j.abschreibungen],
  ]);
  const ebt = rechne([
    [1, ebit],
    [1, j.zinsertraege],
    [-1, j.zinsaufwendungen],
  ]);
  const jahresergebnisRechnerisch = rechne([
    [1, ebt],
    [-1, j.steuern],
  ]);
  const aktiva = rechne([
    [1, j.anlagevermoegen],
    [1, j.umlaufvermoegen],
    [1, j.liquideMittel],
  ]);
  const passiva = rechne([
    [1, j.eigenkapital],
    [1, j.rueckstellungen],
    [1, j.verbindlichkeitenBanken],
    [1, j.sonstigeVerbindlichkeiten],
  ]);
  const nettoverschuldung = rechne([
    [1, j.verbindlichkeitenBanken],
    [-1, j.liquideMittel],
  ]);
  const cashflowSumme = rechne([
    [1, j.cashflowLaufend],
    [1, j.cashflowInvestition],
    [1, j.cashflowFinanzierung],
  ]);
  // Vorjahresvergleich nur mit dem unmittelbar vorangehenden Geschäftsjahr.
  const vj = vorjahr && vorjahr.jahr === j.jahr - 1 ? vorjahr : null;
  const liquiditaetsveraenderung = vj ? rechne([[1, j.liquideMittel], [-1, vj.liquideMittel]]) : null;
  const vjEbitda = vj ? jahresKennzahlen(vj, null).ebitda : null;
  return {
    ebitda,
    ebit,
    ebt,
    jahresergebnisRechnerisch,
    ergebnisAbweichung: rechne([[1, j.jahresergebnis], [-1, jahresergebnisRechnerisch]]),
    aktiva,
    passiva,
    bilanzDifferenz: rechne([[1, aktiva], [-1, passiva]]),
    eigenkapitalquote: quote(j.eigenkapital, passiva),
    ebitdaMarge: quote(ebitda, j.umsatzerloese),
    zinsdeckung: quote(ebitda, j.zinsaufwendungen, 1),
    nettoverschuldung,
    nettoverschuldungZuEbitda: ebitda && ebitda.greaterThan(0) ? quote(nettoverschuldung, ebitda, 1) : null,
    cashflowSumme,
    liquiditaetsveraenderung,
    cashflowDifferenz: rechne([[1, cashflowSumme], [-1, liquiditaetsveraenderung]]),
    umsatzVeraenderung: vj ? rechne([[1, j.umsatzerloese], [-1, vj.umsatzerloese]]) : null,
    ebitdaVeraenderung: vj ? rechne([[1, ebitda], [-1, vjEbitda]]) : null,
  };
}

export type JahresSpalte<T extends JahresDaten> = { jahr: number; daten: T | null; k: JahresKennzahlen | null };

/**
 * Geschäftsjahre aufsteigend; fehlende Jahre zwischen dem ersten und letzten erfassten Jahr
 * erscheinen als Lücke (daten = null) statt übersprungen zu werden.
 */
export function finanzVerlauf<T extends JahresDaten>(liste: T[]): JahresSpalte<T>[] {
  if (liste.length === 0) return [];
  const nachJahr = new Map(liste.map((j) => [j.jahr, j]));
  const jahre = liste.map((j) => j.jahr);
  const von = Math.min(...jahre);
  const bis = Math.max(...jahre);
  const spalten: JahresSpalte<T>[] = [];
  for (let jahr = von; jahr <= bis; jahr++) {
    const daten = nachJahr.get(jahr) ?? null;
    spalten.push({ jahr, daten, k: daten ? jahresKennzahlen(daten, nachJahr.get(jahr - 1) ?? null) : null });
  }
  return spalten;
}

export interface KreditAbgleich {
  /** Summe der belegten Darlehenssalden aller Kredite der Gesellschaft zum Bilanzstichtag */
  summe: Decimal | null;
  /** Anzahl der Kredite mit belegtem Saldo genau zum Bilanzstichtag */
  mitSaldo: number;
  /** Kredite, die am Stichtag ausgezahlt waren, aber keinen belegten Saldo genau zu diesem Tag haben */
  ohneSaldo: string[];
  /** Bilanzwert − Summe der Salden */
  differenz: Decimal | null;
}

/**
 * Abgleich der Bilanzposition „Verbindlichkeiten gegenüber Kreditinstituten“ mit den belegten
 * Darlehenssalden der Kredite zum selben Stichtag. Nur Salden genau zum Bilanzstichtag zählen;
 * Entwürfe und Guthaben nicht. Fehlt ein Saldo, ist die Summe unbekannt.
 */
export function kreditAbgleich(j: Pick<JahresDaten, "ende" | "verbindlichkeitenBanken">, kredite: KreditDaten[]): KreditAbgleich {
  const relevant = kredite.filter((k) => !k.auszahlungsdatum || k.auszahlungsdatum <= j.ende);
  let summe = dezimal(0);
  const ohneSaldo: string[] = [];
  let mitSaldo = 0;
  for (const k of relevant) {
    const s = (k.salden ?? []).find((x) => x.stichtag === j.ende && x.art === "DARLEHEN" && x.status === "BELEGT");
    if (s) {
      summe = summe.plus(s.betrag);
      mitSaldo++;
    } else ohneSaldo.push(k.bezeichnung);
  }
  const bekannt = ohneSaldo.length === 0 && relevant.length > 0 ? summe : null;
  return {
    summe: bekannt,
    mitSaldo,
    ohneSaldo,
    differenz: bekannt && j.verbindlichkeitenBanken ? j.verbindlichkeitenBanken.minus(bekannt) : null,
  };
}
