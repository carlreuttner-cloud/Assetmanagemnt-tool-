/**
 * Rollen- und Rechtekonzept. Reine Funktionen ohne Datenbankzugriff, damit sie
 * überall (auch im Browser für die Navigation) und in Tests nutzbar sind.
 */
import type { Rolle } from "@/generated/prisma/enums";

export const BEREICHE = [
  "uebersicht",
  "gesellschaften",
  "haeuser",
  "mieter",
  "szenarien",
  "berichte",
  "import",
  "kiAssistent",
  "benutzerverwaltung",
] as const;
export type Bereich = (typeof BEREICHE)[number];
export type Aktion = "lesen" | "schreiben";

const ALLES: Aktion[] = ["lesen", "schreiben"];
const LESEN: Aktion[] = ["lesen"];

const RECHTE: Record<Rolle, Partial<Record<Bereich, Aktion[]>>> = {
  ADMIN: Object.fromEntries(BEREICHE.map((b) => [b, ALLES])),
  MITARBEITER: {
    uebersicht: ALLES,
    gesellschaften: ALLES,
    haeuser: ALLES,
    mieter: ALLES,
    szenarien: ALLES,
    berichte: ALLES,
    import: ALLES,
    kiAssistent: ALLES,
  },
  // Darf ausschließlich Mieterlisten für die ihr zugewiesenen Häuser hochladen.
  HAUSVERWALTUNG: {
    import: ALLES,
  },
  // Nur lesen, und nur die ihm zugewiesenen Gesellschaften (siehe sichtbarkeit.ts).
  INVESTOR: {
    uebersicht: LESEN,
    gesellschaften: LESEN,
    haeuser: LESEN,
    mieter: LESEN,
    szenarien: LESEN,
    berichte: LESEN,
    kiAssistent: LESEN,
  },
};

export function darf(rolle: Rolle, bereich: Bereich, aktion: Aktion = "lesen"): boolean {
  return RECHTE[rolle][bereich]?.includes(aktion) ?? false;
}

/** Die Seite, auf der eine Rolle nach der Anmeldung landet. */
export function startseite(rolle: Rolle): string {
  return rolle === "HAUSVERWALTUNG" ? "/import" : "/";
}

/**
 * Ob die Rolle nur einen Ausschnitt des Mandanten sieht.
 * - HAUSVERWALTUNG: nur zugewiesene Häuser
 * - INVESTOR: nur zugewiesene Gesellschaften (und deren Häuser, Kredite, Mieter)
 */
export function istEingeschraenkt(rolle: Rolle): boolean {
  return rolle === "HAUSVERWALTUNG" || rolle === "INVESTOR";
}
