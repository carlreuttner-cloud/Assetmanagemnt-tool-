/**
 * Kapitalkonten der Gesellschafter aus den erfassten Zahlungen. Reine Funktionen.
 *
 * Saldo = Einlagen − Rückzahlungen − Ausschüttungen (Zahlungssaldo). Das ist kein bilanzielles
 * Kapitalkonto: Gewinn- und Verlustanteile sind nicht erfasst. Bewegungen ohne Datum zählen in
 * den Summen, lassen sich aber keinem Jahr zuordnen und werden getrennt ausgewiesen.
 */
import type { IsoDatum } from "./datum";
import { dezimal, type Decimal } from "./geld";

export type BewegungsArt = "EINLAGE" | "RUECKZAHLUNG" | "AUSSCHUETTUNG";
export type Bewegung = { art: BewegungsArt; datum: IsoDatum | null; betrag: Decimal };

export type Kontosummen = {
  einlagen: Decimal;
  rueckzahlungen: Decimal;
  ausschuettungen: Decimal;
  /** Einlagen − Rückzahlungen */
  nettoEinlagen: Decimal;
  /** Einlagen − Rückzahlungen − Ausschüttungen */
  saldo: Decimal;
  ohneDatum: number;
  anzahl: number;
};

export function kontosummen(bewegungen: Bewegung[], bis?: IsoDatum): Kontosummen {
  const relevant = bis ? bewegungen.filter((b) => b.datum !== null && b.datum <= bis) : bewegungen;
  const summe = (art: BewegungsArt) => relevant.filter((b) => b.art === art).reduce((s, b) => s.plus(b.betrag), dezimal(0));
  const einlagen = summe("EINLAGE");
  const rueckzahlungen = summe("RUECKZAHLUNG");
  const ausschuettungen = summe("AUSSCHUETTUNG");
  return {
    einlagen,
    rueckzahlungen,
    ausschuettungen,
    nettoEinlagen: einlagen.minus(rueckzahlungen),
    saldo: einlagen.minus(rueckzahlungen).minus(ausschuettungen),
    ohneDatum: bewegungen.filter((b) => b.datum === null).length,
    anzahl: relevant.length,
  };
}

export type Kontojahr = { jahr: number; einlagen: Decimal; rueckzahlungen: Decimal; ausschuettungen: Decimal; saldoEnde: Decimal };

/**
 * Jahresverlauf vom ersten bis zum angegebenen Jahr. `saldoEnde` enthält nur datierte
 * Bewegungen; Bewegungen ohne Datum stehen in `ohneDatum` daneben.
 */
export function kontoverlauf(bewegungen: Bewegung[], bisJahr: number): { jahre: Kontojahr[]; ohneDatum: Kontosummen | null } {
  const datiert = bewegungen.filter((b): b is Bewegung & { datum: IsoDatum } => b.datum !== null);
  const undatiert = bewegungen.filter((b) => b.datum === null);
  const jahre: Kontojahr[] = [];
  if (datiert.length > 0) {
    const ab = Math.min(...datiert.map((b) => Number(b.datum.slice(0, 4))));
    for (let jahr = ab; jahr <= bisJahr; jahr++) {
      const imJahr = datiert.filter((b) => Number(b.datum.slice(0, 4)) === jahr);
      const s = kontosummen(imJahr);
      jahre.push({ jahr, einlagen: s.einlagen, rueckzahlungen: s.rueckzahlungen, ausschuettungen: s.ausschuettungen, saldoEnde: kontosummen(datiert, `${jahr}-12-31`).saldo });
    }
  }
  return { jahre, ohneDatum: undatiert.length > 0 ? kontosummen(undatiert) : null };
}

/** Anteil an den Netto-Einlagen aller Gesellschafter in Prozent; null, wenn niemand etwas eingezahlt hat. */
export function anteilEinlagen(eigene: Decimal, alle: Decimal): Decimal | null {
  return alle.isZero() ? null : eigene.dividedBy(alle).times(100);
}

/**
 * Weicht der Anteil an den Einlagen um mehr als `toleranz` Prozentpunkte von der vertraglichen
 * Beteiligung ab? null, wenn eines von beiden unbekannt ist.
 */
export function anteilWeichtAb(beteiligung: Decimal | null, einlagenAnteil: Decimal | null, toleranz = dezimal("0.5")): boolean | null {
  if (beteiligung === null || einlagenAnteil === null) return null;
  return beteiligung.minus(einlagenAnteil).abs().greaterThan(toleranz);
}
