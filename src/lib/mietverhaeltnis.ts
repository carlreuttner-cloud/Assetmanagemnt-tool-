/**
 * Regeln für Mietverhältnisse (reine Funktionen).
 */
import { monatsNummer, type IsoDatum } from "./datum";

export type MietStatus = "aktiv" | "beendet" | "zukuenftig";

export function mietStatus(m: { beginn: IsoDatum; ende: IsoDatum | null }, stichtag: IsoDatum): MietStatus {
  if (m.beginn > stichtag) return "zukuenftig";
  if (m.ende !== null && m.ende < stichtag) return "beendet";
  return "aktiv";
}

/** Ganze Monate seit der letzten Mieterhöhung, ersatzweise seit Vertragsbeginn. */
export function monateSeitErhoehung(m: { beginn: IsoDatum; letzteMieterhoehung: IsoDatum | null }, stichtag: IsoDatum): number {
  return monatsNummer(stichtag) - monatsNummer(m.letzteMieterhoehung ?? m.beginn);
}

/** Überschneiden sich zwei Zeiträume (Ende jeweils einschließlich, null = offen)? */
export function ueberschneiden(
  a: { beginn: IsoDatum; ende: IsoDatum | null },
  b: { beginn: IsoDatum; ende: IsoDatum | null },
): boolean {
  const aEnde = a.ende ?? "9999-12-31";
  const bEnde = b.ende ?? "9999-12-31";
  return a.beginn <= bEnde && b.beginn <= aEnde;
}
