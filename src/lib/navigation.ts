import type { Texte } from "@/i18n";
import type { Bereich } from "@/lib/auth/rechte";

export type NavReiter = {
  bereich: Exclude<Bereich, "benutzerverwaltung">;
  pfad: string;
  textSchluessel: keyof Texte["navigation"];
  /** weitere Pfade, die zu diesem Reiter gehören (z. B. Detailseiten an anderer Stelle) */
  auch?: string[];
  /** Nur zeigen, wenn die Rolle im Bereich schreiben darf (z. B. Posteingang, Bankangebote) */
  aktion?: "schreiben";
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
      { bereich: "haeuser", pfad: "/bewertung", textSchluessel: "bewertung" },
      { bereich: "gesellschaften", pfad: "/kapitalkonten", textSchluessel: "kapitalkonten" },
      { bereich: "gesellschaften", pfad: "/renditen", textSchluessel: "renditen" },
      { bereich: "gesellschaften", pfad: "/kapitalabrufe", textSchluessel: "kapitalabrufe" },
      { bereich: "uebersicht", pfad: "/fristen", textSchluessel: "fristen" },
      { bereich: "berichte", pfad: "/berichte", textSchluessel: "berichte" },
    ],
  },
  {
    schluessel: "hausverwaltung",
    reiter: [
      { bereich: "haeuser", pfad: "/haeuser", textSchluessel: "haeuser" },
      { bereich: "haeuser", pfad: "/einheiten", textSchluessel: "einheiten", auch: ["/haeuser/einheiten"] },
      { bereich: "mieter", pfad: "/mieter", textSchluessel: "mieter" },
      { bereich: "haeuser", pfad: "/gewerbe", textSchluessel: "gewerbe" },
      { bereich: "haeuser", pfad: "/stellplaetze", textSchluessel: "stellplaetze" },
      { bereich: "haeuser", pfad: "/investitionen", textSchluessel: "investitionen" },
    ],
  },
  {
    schluessel: "finanzierung",
    reiter: [
      { bereich: "gesellschaften", pfad: "/kredite", textSchluessel: "kredite", auch: ["/gesellschaften/kredite"] },
      { bereich: "gesellschaften", pfad: "/refinanzierung", textSchluessel: "refinanzierung" },
      { bereich: "gesellschaften", pfad: "/zinsrisiko", textSchluessel: "zinsrisiko" },
      { bereich: "gesellschaften", pfad: "/sondertilgungen", textSchluessel: "sondertilgungen" },
      { bereich: "gesellschaften", pfad: "/sicherheiten", textSchluessel: "sicherheiten" },
      { bereich: "gesellschaften", pfad: "/beleihungsreserve", textSchluessel: "beleihungsreserve" },
      { bereich: "gesellschaften", pfad: "/kredite/angebote", textSchluessel: "bankangebote", aktion: "schreiben" },
      { bereich: "gesellschaften", pfad: "/tilgungsplaene", textSchluessel: "tilgungsplaene" },
      { bereich: "gesellschaften", pfad: "/liquiditaet", textSchluessel: "liquiditaet" },
      { bereich: "gesellschaften", pfad: "/ausschuettungen", textSchluessel: "ausschuettungen" },
      { bereich: "gesellschaften", pfad: "/gesellschaften/referenzzinsen", textSchluessel: "referenzzinsen" },
      { bereich: "szenarien", pfad: "/szenarien", textSchluessel: "szenarien" },
      { bereich: "szenarien", pfad: "/ankauf", textSchluessel: "ankauf" },
      { bereich: "szenarien", pfad: "/exit", textSchluessel: "exit" },
      { bereich: "szenarien", pfad: "/ki-vorschlag", textSchluessel: "kiVorschlag" },
    ],
  },
  {
    schluessel: "dokumente",
    reiter: [
      { bereich: "dokumente", pfad: "/posteingang", textSchluessel: "posteingang", aktion: "schreiben" },
      { bereich: "dokumente", pfad: "/dokumente", textSchluessel: "dokumente" },
      { bereich: "import", pfad: "/import", textSchluessel: "import" },
    ],
  },
  {
    schluessel: "analyse",
    reiter: [
      { bereich: "kiAssistent", pfad: "/ki-fragen", textSchluessel: "kiFragen" },
      { bereich: "kiAssistent", pfad: "/ki-assistent", textSchluessel: "kiAssistent" },
    ],
  },
];

const passt = (pfad: string, praefix: string) => (praefix === "/" ? pfad === "/" : pfad === praefix || pfad.startsWith(`${praefix}/`));

/** Gruppen mit den Reitern, die die Rolle sehen darf (leere Gruppen entfallen). */
export function erlaubteNavigation(darf: (bereich: NavReiter["bereich"], aktion?: "schreiben") => boolean): NavGruppe[] {
  return NAVIGATION.map((g) => ({ ...g, reiter: g.reiter.filter((r) => darf(r.bereich, r.aktion)) })).filter((g) => g.reiter.length > 0);
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
