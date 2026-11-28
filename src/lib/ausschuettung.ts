/**
 * Ausschüttungsplanung: Prüfung geplanter Ausschüttungen einer Gesellschaft auf
 * - Liquidität: Bestand laut Liquiditätsplan (die geplante Ausschüttung ist schon enthalten) ab
 *   dem Ausschüttungsmonat bis zum Planende nie unter 0 und nicht unter der Mindestliquidität,
 * - Ausschüttungssperren: Lock-up-Bedingungen der Kredite der Gesellschaft (Stand heute),
 * - Covenants: alle Covenants der Kredite der Gesellschaft eingehalten (Stand heute).
 * Künftige Kennzahlen werden nicht geschätzt; unbekannte Teile führen zu „prüfen“.
 * Reine Funktionen.
 */
import { monatsanfang, monatsNummer, type IsoDatum } from "./datum";
import { dezimal, type Decimal } from "./geld";
import type { Liquiditaetsplan } from "./liquiditaet";

export type LiquiditaetPruefung =
  | { status: "ok" | "unterMindest" | "engpass"; tiefster: { monat: IsoDatum; bestand: Decimal }; hoechstens: Decimal }
  | { status: "unbekannt" | "ausserhalb" | "vergangen" };

export type BedingungStatus = "frei" | "aktiv" | "manuell";
export interface BedingungPruefung {
  kreditId: string;
  kennzahl: string;
  status: BedingungStatus;
}

export type Gesamt = "moeglich" | "blockiert" | "pruefen";

export interface AusschuettungPruefung {
  liquiditaet: LiquiditaetPruefung;
  sperren: BedingungPruefung[];
  covenants: BedingungPruefung[];
  sperreStatus: BedingungStatus | "keine";
  covenantStatus: BedingungStatus | "keine";
  gesamt: Gesamt;
}

/**
 * Höchstmögliche zusätzliche Ausschüttung im Monat `monat`, ohne dass der Bestand danach bis zum
 * Planende unter die Mindestliquidität (ohne Vorgabe: unter 0) fällt. null, wenn unbekannt.
 */
export function spielraum(plan: Liquiditaetsplan, monat: IsoDatum): { betrag: Decimal; tiefster: { monat: IsoDatum; bestand: Decimal } } | null {
  const ab = monatsanfang(monatsNummer(monat));
  const folgende = plan.monate.filter((m) => m.monat >= ab);
  if (folgende.length === 0 || folgende.some((m) => m.bestand === null)) return null;
  const untergrenze = plan.mindestliquiditaet && plan.mindestliquiditaet.greaterThan(0) ? plan.mindestliquiditaet : dezimal(0);
  let tiefster = { monat: folgende[0].monat, bestand: folgende[0].bestand! };
  for (const m of folgende) if (m.bestand!.lessThan(tiefster.bestand)) tiefster = { monat: m.monat, bestand: m.bestand! };
  return { betrag: tiefster.bestand.minus(untergrenze), tiefster };
}

export function pruefeLiquiditaet(plan: Liquiditaetsplan, monat: IsoDatum, betrag: Decimal): LiquiditaetPruefung {
  const ab = monatsanfang(monatsNummer(monat));
  if (monatsNummer(ab) < monatsNummer(plan.beginn)) return { status: "vergangen" };
  if (monatsNummer(ab) > monatsNummer(plan.ende)) return { status: "ausserhalb" };
  const s = spielraum(plan, ab);
  if (!s) return { status: "unbekannt" };
  const status = s.tiefster.bestand.isNegative() ? "engpass" : plan.mindestliquiditaet && s.tiefster.bestand.lessThan(plan.mindestliquiditaet) ? "unterMindest" : "ok";
  // Die geplante Ausschüttung ist im Plan enthalten: höchstens = sie selbst + verbleibender Spielraum.
  return { status, tiefster: s.tiefster, hoechstens: betrag.plus(s.betrag) };
}

const zusammen = (liste: BedingungPruefung[]): BedingungStatus | "keine" =>
  liste.length === 0 ? "keine" : liste.some((b) => b.status === "aktiv") ? "aktiv" : liste.some((b) => b.status === "manuell") ? "manuell" : "frei";

export function pruefeAusschuettung(plan: Liquiditaetsplan, monat: IsoDatum, betrag: Decimal, sperren: BedingungPruefung[], covenants: BedingungPruefung[]): AusschuettungPruefung {
  const liquiditaet = pruefeLiquiditaet(plan, monat, betrag);
  const sperreStatus = zusammen(sperren);
  const covenantStatus = zusammen(covenants);
  const blockiert = liquiditaet.status === "engpass" || liquiditaet.status === "unterMindest" || sperreStatus === "aktiv" || covenantStatus === "aktiv";
  const offen = liquiditaet.status !== "ok" || sperreStatus === "manuell" || covenantStatus === "manuell";
  return { liquiditaet, sperren, covenants, sperreStatus, covenantStatus, gesamt: blockiert ? "blockiert" : offen ? "pruefen" : "moeglich" };
}

/** Verteilung auf Gesellschafter nach Beteiligung; unbekannte Anteile bleiben null. */
export function verteilung(betrag: Decimal, gesellschafter: Array<{ id: string; name: string; beteiligungProzent: Decimal | null }>) {
  const summe = gesellschafter.reduce<Decimal | null>((s, g) => (s === null || g.beteiligungProzent === null ? null : s.plus(g.beteiligungProzent)), dezimal(0));
  return {
    zeilen: gesellschafter.map((g) => ({ ...g, betrag: g.beteiligungProzent === null ? null : betrag.times(g.beteiligungProzent).dividedBy(100) })),
    summeProzent: summe,
    vollstaendig: summe !== null && summe.equals(100),
  };
}
