/**
 * Alle Farben für Diagramme und Kennzeichnungen an einer Stelle.
 *
 * Nutzungsarten haben in der ganzen App immer dieselbe Farbe: gedeckt, nicht zu hell und auf
 * Weiß gut lesbar. Für die Unterscheidung steht immer zusätzlich der Text daneben.
 */
import type { Nutzungsart } from "./nutzungsart";

/** Kräftige, gedeckte Farbe je Nutzungsart (Diagramme, Punkte, Ränder). */
export const NUTZUNGSART_FARBE: Record<Nutzungsart, string> = {
  WOHNUNG: "#4f7591", // Schieferblau
  GEWERBE: "#b07d48", // Ocker
  STELLPLATZ: "#6f8a6b", // Salbeigrün
};

/** Helle Tönung derselben Farbe (Hintergrund von Marken). */
export const NUTZUNGSART_HINTERGRUND: Record<Nutzungsart, string> = {
  WOHNUNG: "#e7eef3",
  GEWERBE: "#f5ece2",
  STELLPLATZ: "#e9efe8",
};

/** Farbe für „vermietet“ bzw. den Rest im Kreisdiagramm. */
export const NEUTRAL_FARBE = "#cbd5e1";

/** Reihenfolge der Farben für allgemeine Diagramme (Kredite, Gesellschaften …). */
export const DIAGRAMM_FARBEN = ["#0f766e", "#1d4ed8", "#b45309", "#7c3aed", "#be123c", "#4d7c0f", "#0369a1", "#a16207"];
