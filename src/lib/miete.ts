/**
 * Mietberechnungen. Gespeichert wird nur die monatliche Nettokaltmiete;
 * die Jahresnettokaltmiete wird immer berechnet und nie in der Datenbank abgelegt.
 */
import { aufCent, dezimal, type Decimal, type DezimalEingabe } from "./geld";

/** Jahresnettokaltmiete = monatliche Nettokaltmiete × 12, auf Cent gerundet. */
export function jahresNettokaltmiete(monatlicheNettokaltmiete: DezimalEingabe): Decimal {
  return aufCent(dezimal(monatlicheNettokaltmiete).times(12));
}
