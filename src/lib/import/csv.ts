/**
 * CSV-Grundlagen für Importe: Zeichensatz erkennen, Trennzeichen erkennen, Felder mit
 * Anführungszeichen lesen, deutsche und englische Zahlen und Datumsangaben verstehen.
 */
import { Decimal } from "../geld";
import { istIsoDatum, type IsoDatum } from "../datum";

/** UTF-8 (mit oder ohne BOM), sonst ISO-8859-1 (typisch für ältere Bankexporte). */
export function dekodiere(daten: Uint8Array): string {
  if (daten[0] === 0xef && daten[1] === 0xbb && daten[2] === 0xbf) return new TextDecoder("utf-8").decode(daten.slice(3));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(daten);
  } catch {
    return new TextDecoder("latin1").decode(daten);
  }
}

/** Zerlegt CSV-Text in Zeilen und Felder. Trennzeichen: das häufigste aus ; , Tab. */
export function leseCsv(text: string, trenner?: string): string[][] {
  const zeilenText = text.replace(/\r\n?/g, "\n");
  const t = trenner ?? erkenneTrenner(zeilenText);
  const zeilen: string[][] = [];
  let feld = "";
  let zeile: string[] = [];
  let inZitat = false;
  for (let i = 0; i < zeilenText.length; i++) {
    const z = zeilenText[i];
    if (inZitat) {
      if (z === '"' && zeilenText[i + 1] === '"') {
        feld += '"';
        i++;
      } else if (z === '"') inZitat = false;
      else feld += z;
    } else if (z === '"') inZitat = true;
    else if (z === t) {
      zeile.push(feld);
      feld = "";
    } else if (z === "\n") {
      zeile.push(feld);
      zeilen.push(zeile);
      zeile = [];
      feld = "";
    } else feld += z;
  }
  if (feld !== "" || zeile.length > 0) {
    zeile.push(feld);
    zeilen.push(zeile);
  }
  return zeilen.map((z) => z.map((f) => f.trim()));
}

function erkenneTrenner(text: string): string {
  const probe = text.split("\n").slice(0, 30).join("\n").replace(/"[^"]*"/g, "");
  const anzahl = (z: string) => probe.split(z).length - 1;
  return [";", ",", "\t"].sort((a, b) => anzahl(b) - anzahl(a))[0];
}

/**
 * Liest einen Betrag: "-16.750,15", "16750,15", "16750.15", "1.234" (deutsche Tausender).
 * Ein Komma ist immer Dezimaltrenner; ohne Komma ist ein Punkt Dezimaltrenner,
 * außer er trennt eindeutig Dreiergruppen.
 */
export function leseZahl(text: string): Decimal | null {
  let s = text.replace(/\s|€|EUR/gi, "");
  if (!s) return null;
  let negativ = false;
  if (s.endsWith("-")) {
    negativ = true;
    s = s.slice(0, -1);
  }
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^[-+]?\d+(\.\d+)?$/.test(s)) return null;
  const d = new Decimal(s);
  return negativ ? d.negated() : d;
}

/** Liest "30.11.2024", "30.11.24", "2024-11-30" oder "30/11/2024" als "JJJJ-MM-TT". */
export function leseDatum(text: string): IsoDatum | null {
  const s = text.trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return pruefe(`${m[1]}-${m[2]}-${m[3]}`);
  m = /^(\d{1,2})[./](\d{1,2})[./](\d{2}|\d{4})$/.exec(s);
  if (m) {
    const jahr = m[3].length === 2 ? `20${m[3]}` : m[3];
    return pruefe(`${jahr}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`);
  }
  return null;
}

function pruefe(d: string): IsoDatum | null {
  return istIsoDatum(d) ? d : null;
}

/** Vereinheitlicht Spaltennamen für den Vergleich ("Betrag (EUR)" → "betrageur"). */
export function normalisiere(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/²/g, "2")
    .replace(/[^a-z0-9]/g, "");
}

/** Spaltenname ohne Einheiten- und Währungszusatz: "Soll-Miete (€/Monat)" → "sollmiete". */
function spaltenKern(name: string): string {
  return normalisiere(name).replace(/(inm2|m2|qm|eurmonat|promonat|monatlich|monat|ineur|euro|eur)+$/, "");
}

/**
 * Sucht in den ersten 40 Zeilen die Kopfzeile einer Tabelle. Jede Spalte wird über eine
 * Liste bekannter Namen erkannt (exakt, Einheiten wie "(EUR)" oder "(m²)" werden ignoriert).
 */
export function findeTabelle<F extends string>(
  zeilen: string[][],
  synonyme: Record<F, readonly string[]>,
  istKopf: (spalten: Partial<Record<F, number>>) => boolean,
): { index: number; spalten: Partial<Record<F, number>> } | null {
  for (let i = 0; i < Math.min(zeilen.length, 40); i++) {
    const namen = zeilen[i].map(normalisiere);
    const kerne = zeilen[i].map(spaltenKern);
    const spalten: Partial<Record<F, number>> = {};
    const vergeben = new Set<number>();
    for (const feld of Object.keys(synonyme) as F[]) {
      const liste = synonyme[feld];
      let pos = namen.findIndex((n, j) => !vergeben.has(j) && liste.includes(n));
      if (pos < 0) pos = kerne.findIndex((n, j) => !vergeben.has(j) && liste.includes(n));
      if (pos >= 0) {
        spalten[feld] = pos;
        vergeben.add(pos);
      }
    }
    if (istKopf(spalten)) return { index: i, spalten };
  }
  return null;
}
