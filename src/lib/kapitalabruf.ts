/**
 * Kapitalabrufe: Gesamtbetrag anteilig nach Beteiligung auf die Gesellschafter verteilen (auf Cent,
 * Rundungsrest an den größten Anteil) und den Eingang je Gesellschafter verfolgen. Eingänge sind
 * Einlagen im Kapitalkonto. Fehlt eine Beteiligung oder ergibt die Summe nicht 100 %, wird nichts
 * verteilt. Reine Funktionen.
 */
import type { IsoDatum } from "./datum";
import { dezimal, type Decimal } from "./geld";
import { verteile } from "./waterfall";

export type Aufteilung =
  | { ok: true; positionen: Array<{ gesellschafterId: string; anteilProzent: Decimal; betrag: Decimal }> }
  | { ok: false; fehler: "keineGesellschafter" | "beteiligungFehlt" | "summe"; namen?: string[]; summe?: Decimal };

export function aufteilen(gesamt: Decimal, gesellschafter: Array<{ id: string; name: string; beteiligungProzent: Decimal | null }>): Aufteilung {
  if (gesellschafter.length === 0) return { ok: false, fehler: "keineGesellschafter" };
  const ohne = gesellschafter.filter((g) => g.beteiligungProzent === null);
  if (ohne.length > 0) return { ok: false, fehler: "beteiligungFehlt", namen: ohne.map((g) => g.name) };
  const summe = gesellschafter.reduce((s, g) => s.plus(g.beteiligungProzent!), dezimal(0));
  if (!summe.equals(100)) return { ok: false, fehler: "summe", summe };
  const mit = gesellschafter.filter((g) => g.beteiligungProzent!.greaterThan(0));
  const betraege = verteile(gesamt, mit.map((g) => g.beteiligungProzent!));
  return { ok: true, positionen: mit.map((g, i) => ({ gesellschafterId: g.id, anteilProzent: g.beteiligungProzent!, betrag: betraege[i] })) };
}

export type PositionStatus = "offen" | "teilweise" | "bezahlt" | "ueberzahlt";

export interface PositionStand {
  eingegangen: Decimal;
  offen: Decimal;
  status: PositionStatus;
  ueberfaellig: boolean;
  letzterEingang: IsoDatum | null;
}

export function positionStand(betrag: Decimal, eingaenge: Array<{ datum: IsoDatum | null; betrag: Decimal }>, faelligAm: IsoDatum, stichtag: IsoDatum): PositionStand {
  const eingegangen = eingaenge.reduce((s, e) => s.plus(e.betrag), dezimal(0));
  const rest = betrag.minus(eingegangen);
  const status: PositionStatus = eingegangen.isZero() ? "offen" : rest.isZero() ? "bezahlt" : rest.isNegative() ? "ueberzahlt" : "teilweise";
  const daten = eingaenge.map((e) => e.datum).filter((d): d is IsoDatum => d !== null).sort();
  return { eingegangen, offen: rest.isNegative() ? dezimal(0) : rest, status, ueberfaellig: rest.greaterThan(0) && faelligAm < stichtag, letzterEingang: daten[daten.length - 1] ?? null };
}

export interface AbrufStand {
  betrag: Decimal;
  eingegangen: Decimal;
  offen: Decimal;
  /** Eingang in Prozent des Abrufs */
  quote: Decimal | null;
  status: PositionStatus;
  ueberfaellig: number;
}

export function abrufStand(positionen: Array<{ betrag: Decimal; stand: PositionStand }>): AbrufStand {
  const betrag = positionen.reduce((s, p) => s.plus(p.betrag), dezimal(0));
  const eingegangen = positionen.reduce((s, p) => s.plus(p.stand.eingegangen), dezimal(0));
  const offen = positionen.reduce((s, p) => s.plus(p.stand.offen), dezimal(0));
  const status: PositionStatus = positionen.every((p) => p.stand.status === "offen")
    ? "offen"
    : offen.isZero()
      ? positionen.some((p) => p.stand.status === "ueberzahlt")
        ? "ueberzahlt"
        : "bezahlt"
      : "teilweise";
  return { betrag, eingegangen, offen, quote: betrag.isZero() ? null : eingegangen.times(100).dividedBy(betrag), status, ueberfaellig: positionen.filter((p) => p.stand.ueberfaellig).length };
}
