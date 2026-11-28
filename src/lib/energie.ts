/**
 * Energie und ESG je Haus: maßgeblicher Energieausweis mit Gültigkeit, Verbräuche je Jahr mit Quelle,
 * Verbrauch je m² Mietfläche und Veränderung zum Vorjahr. Werte stammen nur aus den erfassten
 * Ausweisen und Abrechnungen; fehlt etwas, bleibt es unbekannt (keine Klasse aus dem Kennwert, keine
 * CO₂-Werte aus angenommenen Faktoren). Reine Funktionen.
 */
import { plusMonate, type IsoDatum } from "./datum";
import { dezimal, type Decimal } from "./geld";

export const ENERGIEKLASSEN = ["A+", "A", "B", "C", "D", "E", "F", "G", "H"] as const;
export type Energieklasse = (typeof ENERGIEKLASSEN)[number];
export const istEnergieklasse = (k: string): k is Energieklasse => (ENERGIEKLASSEN as readonly string[]).includes(k);

export const MEDIEN = ["WAERME", "STROM", "WASSER"] as const;
export type Medium = (typeof MEDIEN)[number];

/** Vorlauf für „läuft ab“ in Monaten */
export const VORLAUF_MONATE = 12;

export interface AusweisDaten {
  id: string;
  art: "BEDARF" | "VERBRAUCH";
  energieklasse: string | null;
  endenergie: Decimal | null;
  primaerenergie: Decimal | null;
  energietraeger: string | null;
  ausgestelltAm: IsoDatum | null;
  gueltigBis: IsoDatum | null;
  quelle: string | null;
}

export type AusweisStatus = "fehlt" | "gueltigUnbekannt" | "abgelaufen" | "laeuftAb" | "gueltig";

/** Maßgeblich ist der Ausweis mit dem spätesten Gültigkeitsende; ohne Ende zählt das Ausstellungsdatum. */
export function massgeblicherAusweis<T extends Pick<AusweisDaten, "gueltigBis" | "ausgestelltAm">>(liste: T[]): T | null {
  if (liste.length === 0) return null;
  return [...liste].sort((a, b) => (b.gueltigBis ?? "").localeCompare(a.gueltigBis ?? "") || (b.ausgestelltAm ?? "").localeCompare(a.ausgestelltAm ?? ""))[0];
}

export function ausweisStatus(a: Pick<AusweisDaten, "gueltigBis"> | null, stichtag: IsoDatum): AusweisStatus {
  if (!a) return "fehlt";
  if (!a.gueltigBis) return "gueltigUnbekannt";
  if (a.gueltigBis < stichtag) return "abgelaufen";
  if (a.gueltigBis <= plusMonate(stichtag, VORLAUF_MONATE)) return "laeuftAb";
  return "gueltig";
}

export interface VerbrauchDaten {
  jahr: number;
  medium: Medium;
  menge: Decimal;
  kosten: Decimal | null;
  co2Kg: Decimal | null;
  quelle: string;
}

export interface Flaeche {
  /** Summe der bekannten Flächen der Einheiten in m² */
  summe: Decimal;
  /** Einheiten ohne Flächenangabe (Stellplätze zählen nicht) */
  fehlend: number;
}

export interface VerbrauchJahr extends VerbrauchDaten {
  /** Menge ÷ Mietfläche; null ohne Fläche */
  jeQm: Decimal | null;
  /** Fläche unvollständig: Wert je m² ist zu hoch */
  flaecheUnvollstaendig: boolean;
  /** Veränderung zum Vorjahr in Prozent; null ohne Vorjahr */
  vorjahr: Decimal | null;
}

/** Verlauf eines Mediums, aufsteigend nach Jahr. */
export function verlauf(liste: VerbrauchDaten[], medium: Medium, flaeche: Flaeche): VerbrauchJahr[] {
  const jahre = liste.filter((v) => v.medium === medium).sort((a, b) => a.jahr - b.jahr);
  return jahre.map((v) => {
    const vor = jahre.find((x) => x.jahr === v.jahr - 1);
    return {
      ...v,
      jeQm: flaeche.summe.greaterThan(0) ? v.menge.dividedBy(flaeche.summe) : null,
      flaecheUnvollstaendig: flaeche.fehlend > 0,
      vorjahr: vor && !vor.menge.isZero() ? v.menge.minus(vor.menge).times(100).dividedBy(vor.menge) : null,
    };
  });
}

export interface KlassenVerteilung {
  klasse: Energieklasse | "unbekannt";
  anzahl: number;
}

/** Häuser je Energieklasse (maßgeblicher Ausweis); ohne Ausweis oder ohne Klasse = unbekannt. */
export function klassenVerteilung(klassen: Array<string | null>): KlassenVerteilung[] {
  const zaehle = (k: string | null) => klassen.filter((x) => (k === null ? x === null || !istEnergieklasse(x) : x === k)).length;
  return [...ENERGIEKLASSEN.map((k) => ({ klasse: k, anzahl: zaehle(k) })), { klasse: "unbekannt" as const, anzahl: zaehle(null) }];
}

/** Summe eines Werts über Häuser für ein Jahr; unvollständig, wenn bei einem Haus der Wert fehlt. */
export function jahresSumme(haeuser: Array<{ verbraeuche: VerbrauchDaten[] }>, jahr: number, medium: Medium, feld: "menge" | "co2Kg"): { summe: Decimal; bekannt: number; fehlend: number } {
  let summe = dezimal(0);
  let bekannt = 0;
  for (const h of haeuser) {
    const v = h.verbraeuche.find((x) => x.jahr === jahr && x.medium === medium);
    const w = v ? v[feld] : null;
    if (w === null) continue;
    summe = summe.plus(w);
    bekannt++;
  }
  return { summe, bekannt, fehlend: haeuser.length - bekannt };
}
