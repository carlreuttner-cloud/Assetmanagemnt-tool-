/** Baut einen Link für Filter-Leisten: setzt oder entfernt einen Parameter und behält die übrigen. */
export function filterHref(pfad: string, aktuell: Record<string, string | undefined>, schluessel: string, wert: string | undefined): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...aktuell, [schluessel]: wert })) if (v) p.set(k, v);
  const text = p.toString();
  return text ? `${pfad}?${text}` : pfad;
}

/** Liest einen einzelnen Text-Parameter aus searchParams. */
export const einParam = (wert: string | string[] | undefined): string | undefined => (typeof wert === "string" && wert ? wert : undefined);
