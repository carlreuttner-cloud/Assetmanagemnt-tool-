import { de, type Texte } from "./de";

const woerterbuecher: Record<string, Texte> = {
  de,
};

export const STANDARD_SPRACHE = "de-DE";

/** Liefert die Texte für einen BCP-47-Code wie "de-DE"; fällt auf Deutsch zurück. */
export function texte(sprache: string = STANDARD_SPRACHE): Texte {
  const kurz = sprache.split("-")[0].toLowerCase();
  return woerterbuecher[kurz] ?? de;
}

export type { Texte };
