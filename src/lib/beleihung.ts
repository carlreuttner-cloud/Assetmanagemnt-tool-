/**
 * Beleihungsreserve: mögliche Nachfinanzierung bis zu einem frei gewählten Ziel-LTV.
 *
 *   Reserve = Verkehrswert × Ziel-LTV − belegte Restschuld
 *
 * Nur aus dem letzten Verkehrswert bis zum Stichtag und belegten Restschulden (Salden bzw.
 * Kontostände nach Bankbuchung, siehe `restschuldNachweis`). Fehlt ein Teil, bleibt die
 * Reserve unbekannt (null) und die Lücke wird genannt. Kredite werden mit ihrem Anteil am Haus
 * angerechnet. Eine negative Reserve heißt: Der Ziel-LTV ist schon überschritten.
 */
import type { IsoDatum } from "./datum";
import { dezimal, type Decimal } from "./geld";
import { verkehrswertEintragAm, type HausDaten } from "./kennzahlen";
import { restschuldNachweis, type KreditDaten, type RestschuldNachweis } from "./kredit";

export const ZIEL_LTV_VORGABE = 60;

/** Liest den Ziel-LTV aus einer Eingabe (Prozent, 1 bis 100, Komma erlaubt); sonst die Vorgabe. */
export function zielLtvAus(eingabe: string | undefined | null): Decimal {
  if (!eingabe) return dezimal(ZIEL_LTV_VORGABE);
  const text = eingabe.trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return dezimal(ZIEL_LTV_VORGABE);
  const wert = dezimal(text);
  return wert.greaterThan(0) && wert.lessThanOrEqualTo(100) ? wert : dezimal(ZIEL_LTV_VORGABE);
}

export type ReserveLuecke = "verkehrswert" | "restschuld";

export interface KreditAnteil {
  kreditId: string;
  anteilProzent: Decimal;
  nachweis: RestschuldNachweis | null;
  /** Anteilige Restschuld oder null (unbekannt) */
  betrag: Decimal | null;
}

export interface HausReserve {
  hausId: string;
  gesellschaftId: string;
  verkehrswert: { wert: Decimal; stichtag: IsoDatum } | null;
  kredite: KreditAnteil[];
  restschuld: Decimal | null;
  /** Kredite mit Zusage, aber noch ohne Auszahlung (Restschuld 0, als Hinweis) */
  nichtAusgezahlt: number;
  ltvIst: Decimal | null;
  zielBetrag: Decimal | null;
  reserve: Decimal | null;
  luecken: ReserveLuecke[];
}

export function hausReserve(h: HausDaten, kredite: KreditDaten[], zielLtv: Decimal, stichtag: IsoDatum): HausReserve {
  const vw = verkehrswertEintragAm(h, stichtag);
  const anteile: KreditAnteil[] = [];
  for (const k of kredite) {
    const anteil = k.haeuser.find((x) => x.hausId === h.id)?.anteilProzent;
    if (!anteil) continue;
    const nachweis = restschuldNachweis(k, stichtag);
    anteile.push({ kreditId: k.id, anteilProzent: anteil, nachweis, betrag: nachweis ? nachweis.betrag.times(anteil).dividedBy(100) : null });
  }
  const luecken: ReserveLuecke[] = [];
  if (!vw) luecken.push("verkehrswert");
  let restschuld: Decimal | null = dezimal(0);
  for (const a of anteile) restschuld = a.betrag === null || restschuld === null ? null : restschuld.plus(a.betrag);
  if (restschuld === null) luecken.push("restschuld");
  const zielBetrag = vw ? vw.wert.times(zielLtv).dividedBy(100) : null;
  return {
    hausId: h.id,
    gesellschaftId: h.gesellschaftId,
    verkehrswert: vw,
    kredite: anteile,
    restschuld,
    nichtAusgezahlt: anteile.filter((a) => a.nachweis?.herkunft === "nichtAusgezahlt").length,
    ltvIst: vw && restschuld !== null && vw.wert.greaterThan(0) ? restschuld.dividedBy(vw.wert).times(100) : null,
    zielBetrag,
    reserve: zielBetrag !== null && restschuld !== null ? zielBetrag.minus(restschuld) : null,
    luecken,
  };
}

export interface GruppenReserve {
  anzahl: number;
  /** Häuser mit vollständigen Angaben */
  bekannt: number;
  verkehrswert: Decimal | null;
  restschuld: Decimal | null;
  ltvIst: Decimal | null;
  /** Reserve der Gruppe als Ganzes (Überschreitungen einzelner Häuser verrechnet) */
  reserve: Decimal | null;
  /** Summe nur der Häuser mit positiver Reserve (ohne Verrechnung) */
  reservePositiv: Decimal | null;
  /** Spanne der Stichtage aller verwendeten Werte */
  stichtagVon: IsoDatum | null;
  stichtagBis: IsoDatum | null;
}

/** Fasst Häuser zusammen. Unvollständige Häuser machen die Summen unbekannt (nie als 0 ergänzt). */
export function gruppenReserve(haeuser: HausReserve[], zielLtv: Decimal): GruppenReserve {
  let vw: Decimal | null = dezimal(0);
  let rs: Decimal | null = dezimal(0);
  let pos: Decimal | null = dezimal(0);
  const tage: IsoDatum[] = [];
  let bekannt = 0;
  for (const h of haeuser) {
    vw = h.verkehrswert && vw !== null ? vw.plus(h.verkehrswert.wert) : null;
    rs = h.restschuld !== null && rs !== null ? rs.plus(h.restschuld) : null;
    pos = h.reserve !== null && pos !== null ? (h.reserve.greaterThan(0) ? pos.plus(h.reserve) : pos) : null;
    if (h.luecken.length === 0) bekannt++;
    if (h.verkehrswert) tage.push(h.verkehrswert.stichtag);
    for (const k of h.kredite) if (k.nachweis && k.nachweis.herkunft !== "nichtAusgezahlt") tage.push(k.nachweis.stichtag);
  }
  tage.sort();
  const unvollstaendig = bekannt < haeuser.length;
  return {
    anzahl: haeuser.length,
    bekannt,
    verkehrswert: unvollstaendig ? null : vw,
    restschuld: unvollstaendig ? null : rs,
    ltvIst: !unvollstaendig && vw && rs && vw.greaterThan(0) ? rs.dividedBy(vw).times(100) : null,
    reserve: !unvollstaendig && vw && rs ? vw.times(zielLtv).dividedBy(100).minus(rs) : null,
    reservePositiv: unvollstaendig ? null : pos,
    stichtagVon: tage[0] ?? null,
    stichtagBis: tage[tage.length - 1] ?? null,
  };
}

/** Kredite ohne Hauszuordnung: zählen in keiner Hausreserve und werden als Hinweis gezeigt. */
export function krediteOhneHaus(kredite: KreditDaten[]): KreditDaten[] {
  return kredite.filter((k) => k.haeuser.length === 0);
}
