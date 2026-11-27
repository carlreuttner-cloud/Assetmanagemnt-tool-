import type { Texte } from "@/i18n";
import type { Bereich } from "@/lib/auth/rechte";

export type NavReiter = {
  bereich: Exclude<Bereich, "benutzerverwaltung">;
  pfad: string;
  textSchluessel: keyof Texte["navigation"];
  /** weitere Pfade, die zu diesem Reiter gehören (z. B. Detailseiten an anderer Stelle) */
  auch?: string[];
};

export type NavGruppe = { schluessel: keyof Texte["navigationGruppen"]; reiter: NavReiter[] };

/** Gruppen der Seitenleiste; die Reiter erscheinen oben als Reiterzeile der aktiven Gruppe. */
export const NAVIGATION: NavGruppe[] = [
  {
    schluessel: "ueberblick",
    reiter: [
      { bereich: "uebersicht", pfad: "/", textSchluessel: "uebersicht" },
      { bereich: "gesellschaften", pfad: "/gesellschaften", textSchluessel: "gesellschaften" },
      { bereich: "gesellschaften", pfad: "/portfolios", textSchluessel: "portfolios" },
    ],
  },
  {
    schluessel: "hausverwaltung",
    reiter: [
      { bereich: "haeuser", pfad: "/haeuser", textSchluessel: "haeuser" },
      { bereich: "haeuser", pfad: "/einheiten", textSchluessel: "einheiten", auch: ["/haeuser/einheiten"] },
      { bereich: "mieter", pfad: "/mieter", textSchluessel: "mieter" },
      { bereich: "haeuser", pfad: "/investitionen", textSchluessel: "investitionen" },
    ],
  },
  {
    schluessel: "finanzierung",
    reiter: [
      { bereich: "gesellschaften", pfad: "/kredite", textSchluessel: "kredite", auch: ["/gesellschaften/kredite"] },
      { bereich: "gesellschaften", pfad: "/tilgungsplaene", textSchluessel: "tilgungsplaene" },
      { bereich: "gesellschaften", pfad: "/gesellschaften/referenzzinsen", textSchluessel: "referenzzinsen" },
      { bereich: "szenarien", pfad: "/szenarien", textSchluessel: "szenarien" },
    ],
  },
  {
    schluessel: "dokumente",
    reiter: [
      { bereich: "dokumente", pfad: "/dokumente", textSchluessel: "dokumente" },
      { bereich: "import", pfad: "/import", textSchluessel: "import" },
    ],
  },
  {
    schluessel: "analyse",
    reiter: [
      { bereich: "kiAssistent", pfad: "/ki-assistent", textSchluessel: "kiAssistent" },
      { bereich: "berichte", pfad: "/berichte", textSchluessel: "berichte" },
    ],
  },
];

const passt = (pfad: string, praefix: string) => (praefix === "/" ? pfad === "/" : pfad === praefix || pfad.startsWith(`${praefix}/`));

/** Gruppen mit den Reitern, die die Rolle sehen darf (leere Gruppen entfallen). */
export function erlaubteNavigation(darf: (bereich: NavReiter["bereich"]) => boolean): NavGruppe[] {
  return NAVIGATION.map((g) => ({ ...g, reiter: g.reiter.filter((r) => darf(r.bereich)) })).filter((g) => g.reiter.length > 0);
}

/** Aktive Gruppe und aktiver Reiter zu einem Pfad: der längste passende Pfad gewinnt. */
export function aktiverReiter(gruppen: NavGruppe[], pfad: string): { gruppe: NavGruppe; reiter: NavReiter } | null {
  let best: { gruppe: NavGruppe; reiter: NavReiter; laenge: number } | null = null;
  for (const gruppe of gruppen) {
    for (const reiter of gruppe.reiter) {
      for (const p of [reiter.pfad, ...(reiter.auch ?? [])]) {
        if (passt(pfad, p) && (!best || p.length > best.laenge)) best = { gruppe, reiter, laenge: p.length };
      }
    }
  }
  return best && { gruppe: best.gruppe, reiter: best.reiter };
}
