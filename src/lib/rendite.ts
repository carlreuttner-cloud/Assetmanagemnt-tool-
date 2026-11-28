/**
 * Investorenrenditen aus den erfassten Kapitalbewegungen: IRR (XIRR, Act/365), Eigenkapital-Multiple
 * (Rückflüsse ÷ Einlagen) und Cash-on-Cash je Jahr. Gerechnet wird nur mit datierten Zahlungen; Zahlungen
 * ohne Datum werden gezählt und die Werte als unvollständig gekennzeichnet. Ein Restwert der Beteiligung
 * ist nicht enthalten (realisierte Rendite). Reine Funktionen.
 */
import type { IsoDatum } from "./datum";
import { dezimal, type Decimal } from "./geld";
import type { Bewegung } from "./kapitalkonto";

export interface Zahlung {
  datum: IsoDatum;
  /** aus Sicht des Investors: Einlage negativ, Rückzahlung und Ausschüttung positiv */
  betrag: Decimal;
}

const tage = (von: IsoDatum, bis: IsoDatum) => Math.round((Date.parse(`${bis}T00:00:00Z`) - Date.parse(`${von}T00:00:00Z`)) / 86_400_000);

export function zahlungsstrom(bewegungen: Bewegung[], bis: IsoDatum): { zahlungen: Zahlung[]; ohneDatum: number } {
  const zahlungen = bewegungen
    .filter((b): b is Bewegung & { datum: IsoDatum } => b.datum !== null && b.datum <= bis)
    .map((b) => ({ datum: b.datum, betrag: b.art === "EINLAGE" ? b.betrag.negated() : b.betrag }))
    .sort((a, b) => a.datum.localeCompare(b.datum));
  return { zahlungen, ohneDatum: bewegungen.filter((b) => b.datum === null).length };
}

/** Kapitalwert der Zahlungen zum ersten Zahlungstag bei Zins r (als Dezimalbruch). */
function kapitalwert(z: Zahlung[], r: Decimal): Decimal {
  const start = z[0].datum;
  const basis = r.plus(1);
  return z.reduce((s, x) => s.plus(x.betrag.dividedBy(basis.pow(dezimal(tage(start, x.datum)).dividedBy(365)))), dezimal(0));
}

export type IrrGrund = "keineZahlungen" | "keineEinlage" | "keinRueckfluss" | "keineLoesung";

/** Interner Zinsfuß p. a. in Prozent (Bisektion zwischen −99,99 % und 1.000 %); null mit Grund, wenn nicht bestimmbar. */
export function xirr(zahlungen: Zahlung[]): { irr: Decimal | null; grund: IrrGrund | null } {
  if (zahlungen.length === 0) return { irr: null, grund: "keineZahlungen" };
  if (!zahlungen.some((z) => z.betrag.isNegative())) return { irr: null, grund: "keineEinlage" };
  if (!zahlungen.some((z) => z.betrag.greaterThan(0))) return { irr: null, grund: "keinRueckfluss" };
  let lo = dezimal("-0.9999");
  let hi = dezimal(10);
  let fLo = kapitalwert(zahlungen, lo);
  const fHi = kapitalwert(zahlungen, hi);
  if (fLo.isZero()) return { irr: lo.times(100), grund: null };
  if (fLo.isNegative() === fHi.isNegative()) return { irr: null, grund: "keineLoesung" };
  for (let i = 0; i < 200; i++) {
    const mid = lo.plus(hi).dividedBy(2);
    const fMid = kapitalwert(zahlungen, mid);
    if (fMid.isZero() || hi.minus(lo).abs().lessThan("1e-12")) return { irr: mid.times(100), grund: null };
    if (fMid.isNegative() === fLo.isNegative()) {
      lo = mid;
      fLo = fMid;
    } else hi = mid;
  }
  return { irr: lo.plus(hi).dividedBy(2).times(100), grund: null };
}

export interface CashOnCashJahr {
  jahr: number;
  ausschuettungen: Decimal;
  /** Einlagen − Rückzahlungen bis Jahresende (bzw. Stichtag im laufenden Jahr) */
  kapital: Decimal;
  /** Ausschüttungen ÷ Kapital in Prozent; null ohne Kapital */
  quote: Decimal | null;
}

export interface Rendite {
  einlagen: Decimal;
  rueckzahlungen: Decimal;
  ausschuettungen: Decimal;
  /** Rückzahlungen + Ausschüttungen */
  rueckfluesse: Decimal;
  /** Rückflüsse ÷ Einlagen; null ohne Einlagen */
  multiple: Decimal | null;
  irr: Decimal | null;
  irrGrund: IrrGrund | null;
  ersteZahlung: IsoDatum | null;
  letzteZahlung: IsoDatum | null;
  ohneDatum: number;
  anzahl: number;
  cashOnCash: CashOnCashJahr[];
}

/** Kennzahlen aus den datierten Zahlungen bis zum Stichtag; Cash-on-Cash für die letzten `jahre` Jahre mit Kapital. */
export function rendite(bewegungen: Bewegung[], stichtag: IsoDatum, jahre = 5): Rendite {
  const { zahlungen, ohneDatum } = zahlungsstrom(bewegungen, stichtag);
  const datiert = bewegungen.filter((b) => b.datum !== null && b.datum <= stichtag);
  const summe = (art: Bewegung["art"], bis?: IsoDatum, von?: IsoDatum) =>
    datiert.filter((b) => b.art === art && (!bis || b.datum! <= bis) && (!von || b.datum! >= von)).reduce((s, b) => s.plus(b.betrag), dezimal(0));
  const einlagen = summe("EINLAGE");
  const rueckzahlungen = summe("RUECKZAHLUNG");
  const ausschuettungen = summe("AUSSCHUETTUNG");
  const rueckfluesse = rueckzahlungen.plus(ausschuettungen);
  const { irr, grund } = xirr(zahlungen);

  const cashOnCash: CashOnCashJahr[] = [];
  if (zahlungen.length > 0) {
    const ende = Number(stichtag.slice(0, 4));
    const start = Math.max(Number(zahlungen[0].datum.slice(0, 4)), ende - jahre + 1);
    for (let j = ende; j >= start; j--) {
      const bis = j === ende ? stichtag : `${j}-12-31`;
      const kapital = summe("EINLAGE", bis).minus(summe("RUECKZAHLUNG", bis));
      const aus = summe("AUSSCHUETTUNG", bis, `${j}-01-01`);
      cashOnCash.push({ jahr: j, ausschuettungen: aus, kapital, quote: kapital.greaterThan(0) ? aus.times(100).dividedBy(kapital) : null });
    }
  }

  return {
    einlagen,
    rueckzahlungen,
    ausschuettungen,
    rueckfluesse,
    multiple: einlagen.isZero() ? null : rueckfluesse.dividedBy(einlagen),
    irr,
    irrGrund: grund,
    ersteZahlung: zahlungen[0]?.datum ?? null,
    letzteZahlung: zahlungen[zahlungen.length - 1]?.datum ?? null,
    ohneDatum,
    anzahl: zahlungen.length,
    cashOnCash,
  };
}

