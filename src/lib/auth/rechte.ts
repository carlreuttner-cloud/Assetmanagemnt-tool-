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
  "dokumente",
  "szenarien",
  "berichte",
  "import",
  "kiAssistent",
  "suche",
  "benutzerverwaltung",
  "investorenportal",
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
    dokumente: ALLES,
    szenarien: ALLES,
    berichte: ALLES,
    import: ALLES,
    kiAssistent: ALLES,
    suche: LESEN,
    // Vorschau des Portals aus Sicht eines Investors
    investorenportal: LESEN,
  },
  // Darf ausschließlich Mieterlisten für die ihr zugewiesenen Häuser hochladen.
  HAUSVERWALTUNG: {
    import: ALLES,
  },
  // Nur lesen, und nur die zugewiesenen Gesellschaften (siehe sichtbarkeit.ts); dazu das
  // Investorenportal mit eigenen Kapitalkonten und freigegebenen Berichten/Dokumenten.
  INVESTOR: {
    uebersicht: LESEN,
    gesellschaften: LESEN,
    haeuser: LESEN,
    mieter: LESEN,
    dokumente: LESEN,
    szenarien: LESEN,
    berichte: LESEN,
    kiAssistent: LESEN,
    suche: LESEN,
    investorenportal: LESEN,
  },

};

export function darf(rolle: Rolle, bereich: Bereich, aktion: Aktion = "lesen"): boolean {
  return RECHTE[rolle][bereich]?.includes(aktion) ?? false;
}

/** Die Seite, auf der eine Rolle nach der Anmeldung landet. */
export function startseite(rolle: Rolle): string {
  return rolle === "HAUSVERWALTUNG" ? "/import" : rolle === "INVESTOR" ? "/portal" : "/";
}

/**
 * Ob die Rolle nur einen Ausschnitt des Mandanten sieht.
 * - HAUSVERWALTUNG: nur zugewiesene Häuser
 * - INVESTOR: nur zugewiesene Gesellschaften, und dort nur das Investorenportal
 */
export function istEingeschraenkt(rolle: Rolle): boolean {
  return rolle === "HAUSVERWALTUNG" || rolle === "INVESTOR";
}
