/** Reine Hilfen der globalen Suche (ohne Datenbank, testbar). */

export const SUCH_ARTEN = ["gesellschaft", "haus", "einheit", "mieter", "kredit"] as const;
export type SuchArt = (typeof SUCH_ARTEN)[number];

export type Treffer = {
  art: SuchArt;
  id: string;
  titel: string;
  unter: string | null;
  href: string;
  /** Feld, in dem der Begriff gefunden wurde (z. B. "IBAN"), wenn nicht der Titel */
  feld: string | null;
  /** Ausschnitt des gefundenen Werts */
  fundstelle: string | null;
};

export type Suchbegriff = { text: string; kompakt: string };

/** Mindestens 2 Zeichen; `kompakt` ohne Leerzeichen, für IBANs und Kreditnummern. */
export function suchbegriff(roh: string | null | undefined): Suchbegriff | null {
  const text = (roh ?? "").trim().replace(/\s+/g, " ").slice(0, 100);
  if (text.length < 2) return null;
  return { text, kompakt: text.replace(/\s/g, "") };
}

const enthaelt = (wert: string, s: Suchbegriff) => {
  const w = wert.toLocaleLowerCase("de-DE");
  return w.includes(s.text.toLocaleLowerCase("de-DE")) || w.replace(/\s/g, "").includes(s.kompakt.toLocaleLowerCase("de-DE"));
};

/** Erstes Feld, das den Begriff enthält: [Feldname, Wert]. Der Titel kommt zuerst und wird nicht als Feld gemeldet. */
export function fundFeld(titel: string, felder: Array<[string, string | null | undefined]>, s: Suchbegriff): { feld: string | null; fundstelle: string | null } {
  if (enthaelt(titel, s)) return { feld: null, fundstelle: null };
  for (const [name, wert] of felder) if (wert && enthaelt(wert, s)) return { feld: name, fundstelle: wert };
  return { feld: null, fundstelle: null };
}

/** IBAN in Vierergruppen zur Anzeige. */
export const ibanLesbar = (iban: string) => iban.replace(/\s/g, "").replace(/(.{4})/g, "$1 ").trim();
