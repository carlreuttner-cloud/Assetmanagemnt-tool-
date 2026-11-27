/** Arten von Detailseiten, die als Favorit oder „zuletzt angesehen“ gemerkt werden. */
export const LESEZEICHEN_ARTEN = ["gesellschaft", "haus", "kredit", "mieter", "portfolio"] as const;
export type LesezeichenArt = (typeof LESEZEICHEN_ARTEN)[number];

/** Pfadmuster je Art; Pfade aus dem Browser werden nur akzeptiert, wenn sie passen. */
const MUSTER: Record<LesezeichenArt, RegExp> = {
  gesellschaft: /^\/gesellschaften\/[A-Za-z0-9-]+$/,
  haus: /^\/haeuser\/[A-Za-z0-9-]+$/,
  kredit: /^\/gesellschaften\/kredite\/[A-Za-z0-9-]+$/,
  mieter: /^\/mieter\/personen\/[A-Za-z0-9-]+$/,
  portfolio: /^\/portfolios\/[A-Za-z0-9-]+$/,
};

export const BEREICH_JE_ART = { gesellschaft: "gesellschaften", haus: "haeuser", kredit: "gesellschaften", mieter: "mieter", portfolio: "gesellschaften" } as const;

export function pfadPasst(art: string, pfad: string): art is LesezeichenArt {
  return (LESEZEICHEN_ARTEN as readonly string[]).includes(art) && MUSTER[art as LesezeichenArt].test(pfad);
}

/** Wie viele „zuletzt angesehen“-Einträge je Benutzer behalten werden. */
export const ZULETZT_MAX = 20;

export type LesezeichenEintrag = { pfad: string; titel: string; art: LesezeichenArt };
