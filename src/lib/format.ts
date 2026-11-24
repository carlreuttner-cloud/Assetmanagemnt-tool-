/**
 * Formatierung für die Anzeige, gebunden an Währung und Sprache des Mandanten.
 * Leere Werte werden als "–" angezeigt.
 */
import { formatDatum } from "./datum";
import { dezimal, formatBetrag, formatProzent, type DezimalEingabe } from "./geld";
import { jahresNettokaltmiete } from "./miete";

export type Formatierer = ReturnType<typeof formatierer>;

export function formatierer({ waehrung = "EUR", sprache = "de-DE" }: { waehrung?: string; sprache?: string } = {}) {
  const leer = "–";
  const zahl = (wert: DezimalEingabe, stellen: number) =>
    new Intl.NumberFormat(sprache, { minimumFractionDigits: stellen, maximumFractionDigits: stellen }).format(
      dezimal(wert).toDecimalPlaces(stellen).toFixed(stellen) as unknown as number,
    );
  return {
    sprache,
    waehrung,
    betrag: (wert: DezimalEingabe | null | undefined) => (wert == null ? leer : formatBetrag(wert, { waehrung, sprache })),
    /** Betrag ohne Nachkommastellen, für große Summen in Übersichten */
    betragGanz: (wert: DezimalEingabe | null | undefined) =>
      wert == null
        ? leer
        : new Intl.NumberFormat(sprache, { style: "currency", currency: waehrung, maximumFractionDigits: 0 }).format(
            dezimal(wert).toDecimalPlaces(0).toFixed(0) as unknown as number,
          ),
    /** Kurzform für Achsen, z. B. "16,9 Mio. €" */
    betragKurz: (wert: DezimalEingabe | null | undefined) =>
      wert == null
        ? leer
        : new Intl.NumberFormat(sprache, { style: "currency", currency: waehrung, notation: "compact", maximumSignificantDigits: 3 }).format(
            dezimal(wert).toDecimalPlaces(0).toFixed(0) as unknown as number,
          ),
    /** Monats-Nettokaltmiete und daraus berechnete Jahresmiete */
    jahresmiete: (monat: DezimalEingabe | null | undefined) =>
      monat == null ? leer : formatBetrag(jahresNettokaltmiete(monat), { waehrung, sprache }),
    prozent: (prozentpunkte: DezimalEingabe | null | undefined, stellen = 2) =>
      prozentpunkte == null ? leer : formatProzent(dezimal(prozentpunkte).toDecimalPlaces(stellen), { sprache, stellen }),
    faktor: (wert: DezimalEingabe | null | undefined, stellen = 2) => (wert == null ? leer : zahl(wert, stellen)),
    zahl: (wert: DezimalEingabe | null | undefined, stellen = 0) => (wert == null ? leer : zahl(wert, stellen)),
    flaeche: (wert: DezimalEingabe | null | undefined) => (wert == null ? leer : `${zahl(wert, 2)} m²`),
    datum: (wert: string | Date | null | undefined) => formatDatum(wert, sprache),
    /** Wert für ein Eingabefeld in deutscher Schreibweise ohne Tausenderpunkte, z. B. "1234,56" */
    eingabe: (wert: DezimalEingabe | null | undefined, stellen?: number) => {
      if (wert == null) return "";
      const d = dezimal(wert);
      const text = stellen === undefined ? d.toFixed() : d.toDecimalPlaces(stellen).toFixed(stellen);
      return text.replace(".", sprache.startsWith("de") ? "," : ".");
    },
  };
}
