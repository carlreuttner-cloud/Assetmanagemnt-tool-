/** Baut einen Link für Filter-Leisten: setzt oder entfernt einen Parameter und behält die übrigen. */
export function filterHref(pfad: string, aktuell: Record<string, string | undefined>, schluessel: string, wert: string | undefined): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...aktuell, [schluessel]: wert })) if (v) p.set(k, v);
  const text = p.toString();
  return text ? `${pfad}?${text}` : pfad;
}

/** Liest einen einzelnen Text-Parameter aus searchParams. */
export const einParam = (wert: string | string[] | undefined): string | undefined => (typeof wert === "string" && wert ? wert : undefined);

/**
 * Optionen für eine Auswahlliste (Dropdown) als Filter: „Alle …“ plus ein Eintrag je Objekt.
 * `zuruecksetzen` leert abhängige Filter (z. B. das Haus beim Wechsel der Gesellschaft).
 */
export function auswahlOptionen(
  pfad: string,
  aktuell: Record<string, string | undefined>,
  schluessel: string,
  alle: string,
  eintraege: Array<{ id: string; name: string; gruppe?: string }>,
  zuruecksetzen: string[] = [],
): Array<{ href: string; text: string; aktiv: boolean; gruppe?: string }> {
  const basis = { ...aktuell, ...Object.fromEntries(zuruecksetzen.map((k) => [k, undefined])) };
  return [
    { href: filterHref(pfad, basis, schluessel, undefined), text: alle, aktiv: !aktuell[schluessel] },
    ...eintraege.map((e) => ({ href: filterHref(pfad, basis, schluessel, e.id), text: e.name, aktiv: aktuell[schluessel] === e.id, gruppe: e.gruppe })),
  ];
}
