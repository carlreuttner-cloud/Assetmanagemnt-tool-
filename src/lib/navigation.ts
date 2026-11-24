import type { Texte } from "@/i18n";
import type { Bereich } from "@/lib/auth/rechte";

export type NavEintrag = {
  bereich: Exclude<Bereich, "benutzerverwaltung">;
  pfad: string;
  textSchluessel: keyof Texte["navigation"];
};

/** Reihenfolge der Seitenleiste. */
export const NAVIGATION: NavEintrag[] = [
  { bereich: "uebersicht", pfad: "/", textSchluessel: "uebersicht" },
  { bereich: "gesellschaften", pfad: "/gesellschaften", textSchluessel: "gesellschaften" },
  { bereich: "haeuser", pfad: "/haeuser", textSchluessel: "haeuser" },
  { bereich: "mieter", pfad: "/mieter", textSchluessel: "mieter" },
  { bereich: "dokumente", pfad: "/dokumente", textSchluessel: "dokumente" },
  { bereich: "szenarien", pfad: "/szenarien", textSchluessel: "szenarien" },
  { bereich: "berichte", pfad: "/berichte", textSchluessel: "berichte" },
  { bereich: "import", pfad: "/import", textSchluessel: "import" },
  { bereich: "kiAssistent", pfad: "/ki-assistent", textSchluessel: "kiAssistent" },
];
