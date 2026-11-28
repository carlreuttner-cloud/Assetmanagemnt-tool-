/**
 * Instandhaltungsplan je Haus: Bauteile mit Erneuerungszyklus, Jahr der letzten Erneuerung und
 * geplanten Kosten. Nächste Erneuerung = letzte Erneuerung + Zyklus. Fehlt eines davon, bleibt die
 * Fälligkeit unbekannt; fehlende Kosten bleiben unbekannt und Summen gelten dann als unvollständig.
 * Es wird nur die nächste Erneuerung je Bauteil geplant (keine Wiederholungen, keine Preissteigerung).
 * Reine Funktionen.
 */
import { dezimal, type Decimal } from "./geld";

export const BAUTEIL_ARTEN = ["DACH", "FASSADE", "FENSTER", "HEIZUNG", "AUFZUG", "LEITUNGEN", "ELEKTRO", "TREPPENHAUS", "AUSSENANLAGEN", "SONSTIGES"] as const;
export type BauteilArt = (typeof BAUTEIL_ARTEN)[number];

/** Vorschau für „bald fällig“ in Jahren */
export const VORSCHAU_JAHRE = 5;
/** Jahre im Diagramm der geplanten Kosten */
export const HORIZONT_JAHRE = 10;

export interface BauteilDaten {
  id: string;
  art: BauteilArt;
  bezeichnung: string;
  zyklusJahre: number | null;
  letzteErneuerung: number | null;
  geplanteKosten: Decimal | null;
}

export type BauteilStatus = "unbekannt" | "ueberfaellig" | "faellig" | "bald" | "spaeter";

/** Jahr der nächsten Erneuerung; null, wenn Zyklus oder letzte Erneuerung unbekannt sind. */
export function naechsteErneuerung(b: Pick<BauteilDaten, "zyklusJahre" | "letzteErneuerung">): number | null {
  if (b.zyklusJahre === null || b.letzteErneuerung === null || b.zyklusJahre <= 0) return null;
  return b.letzteErneuerung + b.zyklusJahre;
}

export function bauteilStatus(b: Pick<BauteilDaten, "zyklusJahre" | "letzteErneuerung">, jahr: number): BauteilStatus {
  const n = naechsteErneuerung(b);
  if (n === null) return "unbekannt";
  if (n < jahr) return "ueberfaellig";
  if (n === jahr) return "faellig";
  if (n <= jahr + VORSCHAU_JAHRE) return "bald";
  return "spaeter";
}

/** Planjahr der Erneuerung: überfällige Bauteile zählen im laufenden Jahr. */
export function planjahr(b: Pick<BauteilDaten, "zyklusJahre" | "letzteErneuerung">, jahr: number): number | null {
  const n = naechsteErneuerung(b);
  return n === null ? null : Math.max(n, jahr);
}

export interface KostenJahr {
  jahr: number;
  /** Summe der bekannten Kosten */
  summe: Decimal;
  /** Bauteile in diesem Jahr */
  anzahl: number;
  /** davon ohne Kostenangabe */
  ohneKosten: number;
}

/** Geplante Kosten je Jahr ab `jahr` über `jahre` Jahre (überfällige im ersten Jahr). */
export function kostenJeJahr(bauteile: Array<Pick<BauteilDaten, "zyklusJahre" | "letzteErneuerung" | "geplanteKosten">>, jahr: number, jahre = HORIZONT_JAHRE): KostenJahr[] {
  const liste: KostenJahr[] = Array.from({ length: jahre }, (_, i) => ({ jahr: jahr + i, summe: dezimal(0), anzahl: 0, ohneKosten: 0 }));
  for (const b of bauteile) {
    const p = planjahr(b, jahr);
    if (p === null || p >= jahr + jahre) continue;
    const z = liste[p - jahr];
    z.anzahl++;
    if (b.geplanteKosten === null) z.ohneKosten++;
    else z.summe = z.summe.plus(b.geplanteKosten);
  }
  return liste;
}

/** Summe über Bauteile, die bis einschließlich `bisJahr` geplant sind. */
export function faelligBis(bauteile: Array<Pick<BauteilDaten, "zyklusJahre" | "letzteErneuerung" | "geplanteKosten">>, jahr: number, bisJahr: number) {
  let summe = dezimal(0);
  let anzahl = 0;
  let ohneKosten = 0;
  for (const b of bauteile) {
    const p = planjahr(b, jahr);
    if (p === null || p > bisJahr) continue;
    anzahl++;
    if (b.geplanteKosten === null) ohneKosten++;
    else summe = summe.plus(b.geplanteKosten);
  }
  return { summe, anzahl, ohneKosten };
}

/** Ist das Bauteil für seine nächste Erneuerung schon als Planposition übernommen? */
export function istUebernommen(b: Pick<BauteilDaten, "letzteErneuerung">, positionen: Array<{ monat: string }>): boolean {
  return positionen.some((p) => b.letzteErneuerung === null || Number(p.monat.slice(0, 4)) > b.letzteErneuerung);
}
