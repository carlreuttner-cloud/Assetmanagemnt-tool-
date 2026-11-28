/**
 * Refinanzierungs-Cockpit: nächstes Refinanzierungsereignis je Kredit (Ende der Zinsbindung oder
 * der Laufzeit, das frühere), Phase der Vorbereitung (18–24 Monate vorher) und Fälligkeiten je
 * Jahr (Maturity Wall). Beträge sind die belegte Restschuld heute (keine Fortschreibung);
 * Kredite ohne Beleg werden gezählt, nicht geschätzt. Reine Funktionen.
 */
import { monateZwischen, plusMonate, type IsoDatum } from "./datum";
import { dezimal, type Decimal } from "./geld";
import { restschuldNachweis, type KreditDaten, type RestschuldNachweis } from "./kredit";

/** Vorbereitung beginnt 24 Monate vor dem Ereignis; ab 18 Monaten vorher ist es dringend. */
export const VORLAUF_MONATE = 24;
export const DRINGEND_MONATE = 18;

export type EreignisArt = "zinsbindung" | "kreditende";
export type Phase = "ueberfaellig" | "dringend" | "vorbereiten" | "spaeter";

export interface Ereignis {
  art: EreignisArt;
  datum: IsoDatum;
}

/** Früheres von Zinsbindungsende (nur Festzins) und Laufzeitende; null, wenn keines bekannt ist. */
export function refinanzierungsEreignis(k: Pick<KreditDaten, "zinsArt" | "zinsbindungBis" | "laufzeitBis">): Ereignis | null {
  const kandidaten: Ereignis[] = [];
  if (k.zinsArt === "FEST" && k.zinsbindungBis) kandidaten.push({ art: "zinsbindung", datum: k.zinsbindungBis });
  if (k.laufzeitBis) kandidaten.push({ art: "kreditende", datum: k.laufzeitBis });
  kandidaten.sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : a.art === "kreditende" ? -1 : 1));
  return kandidaten[0] ?? null;
}

export function phase(ereignis: Ereignis, stichtag: IsoDatum): Phase {
  if (ereignis.datum < stichtag) return "ueberfaellig";
  if (ereignis.datum <= plusMonate(stichtag, DRINGEND_MONATE)) return "dringend";
  if (ereignis.datum <= plusMonate(stichtag, VORLAUF_MONATE)) return "vorbereiten";
  return "spaeter";
}

/** Datum, ab dem die Vorbereitung beginnen sollte (Erinnerung im Fristenkalender). */
export const vorbereitungAb = (e: Ereignis): IsoDatum => plusMonate(e.datum, -VORLAUF_MONATE);

export interface Fall {
  kreditId: string;
  gesellschaftId: string;
  ereignis: Ereignis;
  phase: Phase;
  monate: number;
  nachweis: RestschuldNachweis | null;
}

/** Kredite mit Ereignis im Vorlauf (oder schon überschritten), nach Datum sortiert. Getilgte Kredite entfallen. */
export function refinanzierungsFaelle(kredite: KreditDaten[], stichtag: IsoDatum): Fall[] {
  const faelle: Fall[] = [];
  for (const k of kredite) {
    const e = refinanzierungsEreignis(k);
    if (!e) continue;
    const p = phase(e, stichtag);
    if (p === "spaeter") continue;
    const nachweis = restschuldNachweis(k, stichtag);
    if (nachweis && nachweis.herkunft !== "nichtAusgezahlt" && nachweis.betrag.lessThanOrEqualTo(0)) continue;
    faelle.push({ kreditId: k.id, gesellschaftId: k.gesellschaftId, ereignis: e, phase: p, monate: e.datum < stichtag ? -monateZwischen(e.datum, stichtag) : monateZwischen(stichtag, e.datum), nachweis });
  }
  return faelle.sort((a, b) => (a.ereignis.datum < b.ereignis.datum ? -1 : a.ereignis.datum > b.ereignis.datum ? 1 : 0));
}

export interface WandJahr {
  /** Kalenderjahr, "ueberfaellig" (Ereignis vor heute) oder "offen" (variabel ohne Laufzeitende) */
  jahr: string;
  restschuld: Decimal;
  anzahl: number;
  ohneBeleg: number;
  zinsbindung: number;
  kreditende: number;
  kreditIds: string[];
}

/** Maturity Wall: Ereignisse je Jahr über `jahre` Jahre ab heute; spätere Jahre zusammengefasst unter dem letzten Jahr + "später". */
export function maturityWall(kredite: KreditDaten[], stichtag: IsoDatum, jahre = 10): WandJahr[] {
  const start = Number(stichtag.slice(0, 4));
  const schluessel = [ "ueberfaellig", ...Array.from({ length: jahre }, (_, i) => String(start + i)), "spaeter", "offen"];
  const wand = new Map<string, WandJahr>(schluessel.map((j) => [j, { jahr: j, restschuld: dezimal(0), anzahl: 0, ohneBeleg: 0, zinsbindung: 0, kreditende: 0, kreditIds: [] }]));
  for (const k of kredite) {
    const rest = restschuldNachweis(k, stichtag);
    if (rest && rest.herkunft !== "nichtAusgezahlt" && rest.betrag.lessThanOrEqualTo(0)) continue;
    const e = refinanzierungsEreignis(k);
    const jahr = !e ? "offen" : e.datum < stichtag ? "ueberfaellig" : Number(e.datum.slice(0, 4)) >= start + jahre ? "spaeter" : e.datum.slice(0, 4);
    const w = wand.get(jahr)!;
    w.anzahl++;
    w.kreditIds.push(k.id);
    if (e) w[e.art]++;
    if (rest && rest.herkunft !== "nichtAusgezahlt") w.restschuld = w.restschuld.plus(rest.betrag);
    else if (!rest) w.ohneBeleg++;
  }
  return schluessel.map((j) => wand.get(j)!).filter((w) => w.anzahl > 0 || /^\d{4}$/.test(w.jahr));
}
