/**
 * Nutzungsarten (Wohnen, Gewerbe, Stellplätze) an einer Stelle: Reihenfolge, Farben und Maß.
 *
 * - Jede Nutzungsart hat in der ganzen App dieselbe Farbe; definiert in src/lib/farben.ts.
 * - Wohnen und Gewerbe werden in m² gemessen. Stellplätze zählen in Stück und gehören nicht zur
 *   Wohn- und Gewerbefläche (ihre Fläche fließt nicht in Flächensummen oder die Leerstandsquote).
 * - Texte stehen in src/i18n (`nutzungsarten`, `einheitArten`).
 */

export const NUTZUNGSARTEN = ["WOHNUNG", "GEWERBE", "STELLPLATZ"] as const;
export type Nutzungsart = (typeof NUTZUNGSARTEN)[number];

export { NUTZUNGSART_FARBE, NUTZUNGSART_HINTERGRUND } from "./farben";

/** true, wenn die Nutzungsart in m² gemessen wird (Wohnen, Gewerbe); Stellplätze zählen in Stück. */
export const inFlaeche = (art: Nutzungsart) => art !== "STELLPLATZ";

/** Wert eines URL-Parameters als Nutzungsart; sonst undefined (= alle). */
export function nutzungsartAus(wert: unknown): Nutzungsart | undefined {
  return NUTZUNGSARTEN.find((a) => a === wert);
}
