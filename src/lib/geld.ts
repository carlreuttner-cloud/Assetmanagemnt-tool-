/**
 * Zentrale Hilfen für Geldbeträge, Zinssätze und Prozentanteile.
 *
 * Regeln:
 * - In der Datenbank: Decimal(14, 2) für Beträge, Decimal(9, 6) für Zinsen/Prozente.
 * - Im Code: immer `Decimal` (decimal.js), nie `number`.
 * - Zum Browser: als Text (`zuText`), nie als JavaScript-Zahl.
 */
import Decimal from "decimal.js";

// Genug Stellen für Zwischenergebnisse; gerundet wird erst bei der Ausgabe bzw. Speicherung.
Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export { Decimal };

/** Alles, was sich verlustfrei in eine Dezimalzahl umwandeln lässt (auch Prisma.Decimal). */
export type DezimalEingabe = Decimal | string | bigint | number | { toFixed(): string };

/**
 * Wandelt einen Wert in eine Dezimalzahl um.
 * Gleitkommazahlen mit Nachkommastellen werden abgelehnt, weil sie bereits ungenau sein können.
 */
export function dezimal(wert: DezimalEingabe): Decimal {
  if (wert instanceof Decimal) return wert;
  if (typeof wert === "number") {
    if (!Number.isSafeInteger(wert)) {
      throw new TypeError(
        `Gleitkommazahl ${wert} nicht erlaubt. Bitte Text oder Decimal übergeben.`,
      );
    }
    return new Decimal(wert);
  }
  if (typeof wert === "bigint") return new Decimal(wert.toString());
  if (typeof wert === "string") return new Decimal(wert);
  // Prisma.Decimal ist eine eigene decimal.js-Kopie; toFixed() liefert die exakte Darstellung.
  return new Decimal(wert.toFixed());
}

/** Rundet kaufmännisch auf Cent. */
export function aufCent(wert: DezimalEingabe): Decimal {
  return dezimal(wert).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Textdarstellung für die Übergabe an den Browser oder an JSON. */
export function zuText(wert: DezimalEingabe | null | undefined): string | null {
  if (wert === null || wert === undefined) return null;
  return dezimal(wert).toFixed();
}

/**
 * Liest eine Benutzereingabe wie "1.234,56", "1234,56", "-12,5" oder "1234.56".
 * In de-DE gilt das Komma als Dezimaltrenner, Punkte sind Tausendertrenner.
 */
export function parseBetrag(eingabe: string, sprache = "de-DE"): Decimal {
  const text = eingabe.trim().replace(/\s| |€/g, "");
  if (text === "") throw new TypeError("Leere Eingabe");

  const { dezimalTrenner, gruppenTrenner } = trennzeichen(sprache);
  let normalisiert: string;
  if (text.includes(dezimalTrenner)) {
    normalisiert = text.split(gruppenTrenner).join("").replace(dezimalTrenner, ".");
  } else if (dezimalTrenner === "," && /^-?\d+\.\d{1,2}$/.test(text)) {
    // "1234.56" in deutscher Oberfläche: eindeutig als Dezimalpunkt gemeint
    normalisiert = text;
  } else {
    normalisiert = text.split(gruppenTrenner).join("");
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalisiert)) {
    throw new TypeError(`Ungültiger Betrag: "${eingabe}"`);
  }
  return new Decimal(normalisiert);
}

/** Formatiert einen Betrag als Währung, z. B. "1.234,56 €". */
export function formatBetrag(
  wert: DezimalEingabe,
  { waehrung = "EUR", sprache = "de-DE" }: { waehrung?: string; sprache?: string } = {},
): string {
  // Intl.NumberFormat akzeptiert Dezimaltext ohne Umweg über eine Gleitkommazahl.
  return new Intl.NumberFormat(sprache, { style: "currency", currency: waehrung }).format(
    aufCent(wert).toFixed(2) as unknown as number,
  );
}

/**
 * Formatiert einen Prozentwert. Erwartet Prozentpunkte wie in der Datenbank
 * gespeichert (3.125 = 3,125 %).
 */
export function formatProzent(
  prozentpunkte: DezimalEingabe,
  { sprache = "de-DE", stellen = 2 }: { sprache?: string; stellen?: number } = {},
): string {
  const anteil = dezimal(prozentpunkte).dividedBy(100).toFixed();
  return new Intl.NumberFormat(sprache, {
    style: "percent",
    minimumFractionDigits: stellen,
    maximumFractionDigits: Math.max(stellen, 4),
  }).format(anteil as unknown as number);
}

function trennzeichen(sprache: string) {
  const teile = new Intl.NumberFormat(sprache).formatToParts(12345.6);
  return {
    dezimalTrenner: teile.find((t) => t.type === "decimal")?.value ?? ",",
    gruppenTrenner: teile.find((t) => t.type === "group")?.value ?? ".",
  };
}
