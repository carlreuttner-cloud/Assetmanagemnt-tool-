/**
 * Datumshilfen. Reine Kalenderdaten (Stichtage, Vertragsdaten) werden im Code als Text
 * "JJJJ-MM-TT" geführt; so gibt es keine Zeitzonenfehler und Vergleiche gehen mit < und >.
 * Die Datenbank liefert @db.Date als Date um 00:00 UTC.
 */

export type IsoDatum = string;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Date (aus der Datenbank) als "JJJJ-MM-TT". */
export function isoDatum(datum: Date): IsoDatum;
export function isoDatum(datum: Date | null | undefined): IsoDatum | null;
export function isoDatum(datum: Date | null | undefined): IsoDatum | null {
  return datum ? datum.toISOString().slice(0, 10) : null;
}

/** "JJJJ-MM-TT" als Date für die Datenbank (00:00 UTC). */
export function alsDbDatum(datum: IsoDatum): Date {
  if (!istIsoDatum(datum)) throw new TypeError(`Ungültiges Datum: "${datum}"`);
  return new Date(`${datum}T00:00:00Z`);
}

export function istIsoDatum(text: string): boolean {
  if (!ISO.test(text)) return false;
  const d = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
}

/** Heutiges Datum in Deutschland (Europe/Berlin) als "JJJJ-MM-TT". */
export function heute(zeitzone = "Europe/Berlin"): IsoDatum {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zeitzone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(),
  );
}

/** Fortlaufende Monatsnummer (Jahr × 12 + Monat − 1). */
export function monatsNummer(datum: IsoDatum): number {
  const [jahr, monat] = datum.split("-").map(Number);
  return jahr * 12 + monat - 1;
}

export function monatsende(nummer: number): IsoDatum {
  const jahr = Math.floor(nummer / 12);
  const monat = (nummer % 12) + 1;
  const tag = new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
  return `${jahr}-${zwei(monat)}-${zwei(tag)}`;
}

export function monatsanfang(nummer: number): IsoDatum {
  const jahr = Math.floor(nummer / 12);
  return `${jahr}-${zwei((nummer % 12) + 1)}-01`;
}

/** Addiert Monate; der Tag wird auf das Monatsende begrenzt (31.01. + 1 = 28./29.02.). */
export function plusMonate(datum: IsoDatum, monate: number): IsoDatum {
  const [j, m, t] = datum.split("-").map(Number);
  const ziel = j * 12 + (m - 1) + monate;
  const jahr = Math.floor(ziel / 12);
  const monat = (ziel % 12) + 1;
  const letzter = new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
  return `${jahr}-${zwei(monat)}-${zwei(Math.min(t, letzter))}`;
}

export function plusTage(datum: IsoDatum, tage: number): IsoDatum {
  const d = alsDbDatum(datum);
  d.setUTCDate(d.getUTCDate() + tage);
  return isoDatum(d);
}

/** Ganze Monate zwischen zwei Daten (negativ, wenn `bis` vor `von` liegt). */
export function monateZwischen(von: IsoDatum, bis: IsoDatum): number {
  return monatsNummer(bis) - monatsNummer(von);
}

/** Formatiert "JJJJ-MM-TT" oder ein Date als "TT.MM.JJJJ". */
export function formatDatum(datum: IsoDatum | Date | null | undefined, sprache = "de-DE"): string {
  if (!datum) return "–";
  const d = typeof datum === "string" ? alsDbDatum(datum) : datum;
  return new Intl.DateTimeFormat(sprache, { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

/** "MM/JJJJ" für Monatsangaben in Tabellen und Grafiken. */
export function formatMonat(datum: IsoDatum, sprache = "de-DE"): string {
  return new Intl.DateTimeFormat(sprache, { timeZone: "UTC", month: "2-digit", year: "numeric" }).format(alsDbDatum(datum));
}

function zwei(n: number) {
  return String(n).padStart(2, "0");
}
