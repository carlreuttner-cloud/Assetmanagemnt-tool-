/**
 * Serienbriefe an Mieter: Vorlagen mit Platzhaltern {{name}}, die je Empfänger aus den erfassten Daten
 * gefüllt werden. Fehlt ein Wert, wird er nicht ergänzt, sondern als Lücke markiert; ein Brief mit
 * Lücken wird nicht erstellt. Bei Mieterhöhungen wird die neue Miete im Code gerechnet
 * (aktuelle Nettokaltmiete × (1 + Prozent / 100), auf Cent gerundet). Reine Funktionen.
 */
import { aufCent, dezimal, type Decimal } from "./geld";
import { naechsteMieterhoehung } from "./fristen";
import { plusMonate, type IsoDatum } from "./datum";
import type { Nutzungsart } from "./nutzungsart";

export const PLATZHALTER = [
  "mieter",
  "anschrift",
  "haus",
  "einheit",
  "lage",
  "flaeche",
  "mietbeginn",
  "miete",
  "jahresmiete",
  "letzteErhoehung",
  "verlangenAb",
  "wirksamAb",
  "neueMiete",
  "neueJahresmiete",
  "erhoehungBetrag",
  "erhoehungProzent",
  "gesellschaft",
  "datum",
] as const;
export type Platzhalter = (typeof PLATZHALTER)[number];

/** Platzhalter, die nur bei Mieterhöhungen gefüllt werden */
export const NUR_MIETERHOEHUNG: readonly Platzhalter[] = ["verlangenAb", "wirksamAb", "neueMiete", "neueJahresmiete", "erhoehungBetrag", "erhoehungProzent"];

/** Kappungsgrenze § 558 Abs. 3 BGB (allgemein; in Gebieten mit Verordnung 15 %) */
export const KAPPUNGSGRENZE_PROZENT = 20;

const MUSTER = /\{\{\s*([a-zA-Z]+)\s*\}\}/g;

export const istPlatzhalter = (k: string): k is Platzhalter => (PLATZHALTER as readonly string[]).includes(k);

/** Platzhalter im Text, die es nicht gibt (z. B. Tippfehler). */
export function unbekanntePlatzhalter(text: string): string[] {
  return [...new Set([...text.matchAll(MUSTER)].map((m) => m[1]).filter((k) => !istPlatzhalter(k)))];
}

export interface Gefuellt {
  text: string;
  /** Platzhalter ohne Wert */
  fehlend: Platzhalter[];
}

/** Ersetzt die Platzhalter; fehlende Werte erscheinen als „[fehlt: name]“. */
export function fuelleVorlage(text: string, werte: Partial<Record<Platzhalter, string | null>>, fehltText = "fehlt"): Gefuellt {
  const fehlend = new Set<Platzhalter>();
  const ergebnis = text.replace(MUSTER, (ganz, k: string) => {
    if (!istPlatzhalter(k)) return ganz;
    const w = werte[k];
    if (w === null || w === undefined || w === "") {
      fehlend.add(k);
      return `[${fehltText}: ${k}]`;
    }
    return w;
  });
  return { text: ergebnis, fehlend: [...fehlend] };
}

export interface Erhoehung {
  neueMiete: Decimal;
  betrag: Decimal;
  ueberKappung: boolean;
}

export function rechneErhoehung(aktuell: Decimal, prozent: Decimal): Erhoehung {
  const neueMiete = aufCent(aktuell.times(prozent.dividedBy(100).plus(1)));
  return { neueMiete, betrag: neueMiete.minus(aktuell), ueberKappung: prozent.greaterThan(KAPPUNGSGRENZE_PROZENT) };
}

export type EmpfaengerGrund = "keinWohnraum" | "nochNicht" | null;

/** Kann jetzt eine Erhöhung nach § 558 BGB verlangt werden? */
export function erhoehungMoeglich(mv: { einheitArt: Nutzungsart; beginn: IsoDatum; letzteMieterhoehung: IsoDatum | null }, stichtag: IsoDatum) {
  const n = naechsteMieterhoehung(mv);
  if (n.art !== "moeglich") return { moeglich: false as const, grund: "keinWohnraum" as const, ergebnis: n };
  if (n.verlangenAb > stichtag) return { moeglich: false as const, grund: "nochNicht" as const, ergebnis: n };
  return { moeglich: true as const, grund: null, ergebnis: n };
}

/** Prozentwert aus der Eingabe (0 < p ≤ 100) oder null. */
export function prozentAusText(text: string | null | undefined): Decimal | null {
  if (!text) return null;
  const t = text.replace(",", ".").trim();
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const p = dezimal(t);
  return p.greaterThan(0) && p.lessThanOrEqualTo(100) ? p : null;
}

/**
 * Wirksamwerden der Erhöhung: mit Beginn des dritten Kalendermonats nach Zugang (§ 558b BGB),
 * frühestens 15 Monate nach Mietbeginn bzw. letzter Erhöhung. Angenommen wird Zugang im Monat des
 * Briefdatums.
 */
export function wirksamAb(fruehestens: IsoDatum, briefdatum: IsoDatum): IsoDatum {
  const nachZugang = `${plusMonate(briefdatum, 3).slice(0, 7)}-01`;
  return nachZugang > fruehestens ? nachZugang : fruehestens;
}
