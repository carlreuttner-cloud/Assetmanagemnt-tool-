/**
 * Dokumenten-Checkliste: Status eines Pflichtdokuments je Gesellschaft, Haus oder Kredit. Reine Funktionen.
 *
 * Grundlage ist der erfasste Nachweis (liegt vor / fehlt, Dokumentdatum) oder – wenn die Vorgabe eine
 * Automatik hat – der Stand aus den gespeicherten Daten (letztes Gutachten, letzter endgültiger
 * Jahresabschluss, letzte Saldenbestätigung). Liegen beide vor, zählt der jüngere Stand.
 *
 * Status:
 * - vorhanden:          liegt vor und ist aktuell (oder unbegrenzt gültig)
 * - laeuftAb:           liegt vor, wird aber in den nächsten 60 Tagen veraltet
 * - veraltet:           Dokumentdatum + Gültigkeit liegt vor dem Stichtag
 * - datumFehlt:         liegt vor, aber ohne Dokumentdatum – Aktualität unbekannt (nicht „aktuell“)
 * - fehlt:              kein Nachweis oder ausdrücklich als fehlend erfasst
 * - nichtErforderlich:  für dieses Objekt nicht nötig
 */
import { plusMonate, plusTage, type IsoDatum } from "./datum";

export type DokumentStatus = "vorhanden" | "laeuftAb" | "veraltet" | "datumFehlt" | "fehlt" | "nichtErforderlich";
export const STATUS_REIHENFOLGE: DokumentStatus[] = ["fehlt", "veraltet", "datumFehlt", "laeuftAb", "vorhanden", "nichtErforderlich"];

export interface Vorgabe {
  gueltigMonate: number | null;
}

export interface Nachweis {
  vorhanden: boolean;
  nichtErforderlich: boolean;
  dokumentDatum: IsoDatum | null;
}

export interface AutomatischerStand {
  datum: IsoDatum;
  /** z. B. "Gutachten vom 31.12.2025" */
  beschreibung: string;
}

export interface DokumentBewertung {
  status: DokumentStatus;
  datum: IsoDatum | null;
  gueltigBis: IsoDatum | null;
  herkunft: "nachweis" | "automatik" | null;
  automatik: AutomatischerStand | null;
}

export const VORWARNUNG_TAGE = 60;

export function dokumentStatus(vorgabe: Vorgabe, nachweis: Nachweis | null, automatik: AutomatischerStand | null, stichtag: IsoDatum): DokumentBewertung {
  if (nachweis?.nichtErforderlich) return { status: "nichtErforderlich", datum: null, gueltigBis: null, herkunft: "nachweis", automatik };
  const ausNachweis = nachweis?.vorhanden ? nachweis : null;
  // Der jüngere Stand gewinnt; ein Nachweis ohne Datum nur, wenn es keinen automatischen Stand gibt.
  let herkunft: DokumentBewertung["herkunft"] = null;
  let datum: IsoDatum | null = null;
  if (ausNachweis && automatik) {
    if (ausNachweis.dokumentDatum && ausNachweis.dokumentDatum >= automatik.datum) {
      herkunft = "nachweis";
      datum = ausNachweis.dokumentDatum;
    } else {
      herkunft = "automatik";
      datum = automatik.datum;
    }
  } else if (ausNachweis) {
    herkunft = "nachweis";
    datum = ausNachweis.dokumentDatum;
  } else if (automatik) {
    herkunft = "automatik";
    datum = automatik.datum;
  }
  if (!herkunft) return { status: "fehlt", datum: null, gueltigBis: null, herkunft: nachweis ? "nachweis" : null, automatik };
  if (vorgabe.gueltigMonate === null) return { status: "vorhanden", datum, gueltigBis: null, herkunft, automatik };
  if (!datum) return { status: "datumFehlt", datum: null, gueltigBis: null, herkunft, automatik };
  const gueltigBis = plusMonate(datum, vorgabe.gueltigMonate);
  const status: DokumentStatus = gueltigBis < stichtag ? "veraltet" : gueltigBis <= plusTage(stichtag, VORWARNUNG_TAGE) ? "laeuftAb" : "vorhanden";
  return { status, datum, gueltigBis, herkunft, automatik };
}

export type StatusZaehlung = Record<DokumentStatus, number> & { gesamt: number; offen: number };

/** Zählt die Status; „offen“ = fehlt, veraltet oder Datum fehlt. */
export function zaehleStatus(liste: DokumentStatus[]): StatusZaehlung {
  const z = Object.fromEntries(STATUS_REIHENFOLGE.map((s) => [s, 0])) as Record<DokumentStatus, number>;
  for (const s of liste) z[s]++;
  return { ...z, gesamt: liste.length, offen: z.fehlt + z.veraltet + z.datumFehlt };
}

export type Bezug = "GESELLSCHAFT" | "HAUS" | "KREDIT";
export type Automatik = "GUTACHTEN" | "JAHRESABSCHLUSS" | "SALDENBESTAETIGUNG";

/**
 * Vorschlag für Pflichtdokumente; Namen und Beschreibungen stehen in `src/i18n` (dokumente.standard).
 * Gültigkeit in Monaten ab Dokumentdatum; null = unbegrenzt.
 */
export const STANDARD_VORGABEN: Array<{ schluessel: string; bezug: Bezug; gueltigMonate: number | null; automatik: Automatik | null }> = [
  { schluessel: "gesellschaftsvertrag", bezug: "GESELLSCHAFT", gueltigMonate: null, automatik: null },
  { schluessel: "handelsregister", bezug: "GESELLSCHAFT", gueltigMonate: 12, automatik: null },
  { schluessel: "gesellschafterliste", bezug: "GESELLSCHAFT", gueltigMonate: 12, automatik: null },
  { schluessel: "jahresabschluss", bezug: "GESELLSCHAFT", gueltigMonate: 18, automatik: "JAHRESABSCHLUSS" },
  { schluessel: "grundbuch", bezug: "HAUS", gueltigMonate: 12, automatik: null },
  { schluessel: "kaufvertrag", bezug: "HAUS", gueltigMonate: null, automatik: null },
  { schluessel: "gutachten", bezug: "HAUS", gueltigMonate: 36, automatik: "GUTACHTEN" },
  { schluessel: "energieausweis", bezug: "HAUS", gueltigMonate: 120, automatik: null },
  { schluessel: "versicherung", bezug: "HAUS", gueltigMonate: 12, automatik: null },
  { schluessel: "baulasten", bezug: "HAUS", gueltigMonate: null, automatik: null },
  { schluessel: "darlehensvertrag", bezug: "KREDIT", gueltigMonate: null, automatik: null },
  { schluessel: "sicherheiten", bezug: "KREDIT", gueltigMonate: null, automatik: null },
  { schluessel: "saldenbestaetigung", bezug: "KREDIT", gueltigMonate: 14, automatik: "SALDENBESTAETIGUNG" },
];
