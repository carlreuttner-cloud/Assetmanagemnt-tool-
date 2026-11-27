/**
 * Exit-Kalkulation je Haus: Verkaufspreis zum gewählten Zeitpunkt, abzüglich Verkaufskosten,
 * Kreditablöse und Vorfälligkeitsentschädigung. Reine Funktionen.
 *
 * Preisvorschläge (frei änderbar):
 * - aus Miete: Soll-Jahresnettokaltmiete der laufenden Mietverhältnisse × Faktor; Faktor aus dem
 *   jüngsten Gutachten (Verkehrswert ÷ Rohertrag) oder frei eingegeben, sonst unbekannt.
 * - Marktwert: jüngster Wert ohne Gutachten (z. B. Bankbewertung) mit Stichtag und Quelle.
 * - Gutachten: Verkehrswert des jüngsten Gutachtens mit Stichtag.
 * Werte werden nicht auf den Verkaufszeitpunkt fortgeschrieben; der Stichtag steht dabei.
 *
 * Kreditablöse je Kredit: Restschuld × Anteil des Hauses am Kredit. Restschuld bis heute belegt,
 * danach Planwert (gültiger Tilgungsplan oder aus belegter Restschuld, heutigem Zinssatz und Rate
 * gerechnet). Vorfälligkeitsentschädigung nur bei Festzins vor Ende der Zinsbindung, als Prozent
 * der Ablöse; ohne Angabe unbekannt (keine Schätzung).
 */
import { aufCent, Decimal, dezimal } from "./geld";
import { monatsNummer, plusTage, type IsoDatum } from "./datum";
import type { HausBewertung } from "./bewertung";
import { hausSummen, type HausDaten } from "./kennzahlen";
import { jahresNettokaltmiete } from "./miete";
import { berechneTilgungsplan, gueltigerTilgungsplan, restschuldNachweis, zinssatz, type KreditDaten, type ReferenzWert } from "./kredit";

export const PREIS_BASEN = ["miete", "marktwert", "gutachten", "frei"] as const;
export type PreisBasis = (typeof PREIS_BASEN)[number];

export interface ExitParameter {
  verkaufsdatum: IsoDatum;
  basis: PreisBasis;
  /** nur bei Basis „frei“ */
  preis: Decimal | null;
  /** Kaufpreisfaktor für den Vorschlag aus Miete; null = aus dem Gutachten */
  faktor: Decimal | null;
  maklerProzent: Decimal;
  sonstigeProzent: Decimal;
  /** Vorfälligkeitsentschädigung in Prozent der Ablöse; null = unbekannt */
  vfeProzent: Decimal | null;
}

export interface Rohertragsfaktor {
  wert: Decimal;
  stichtag: IsoDatum;
}

export interface Preisvorschlaege {
  miete: {
    sollMonat: Decimal;
    jahresmiete: Decimal;
    faktor: Decimal | null;
    faktorQuelle: "gutachten" | "eingabe" | null;
    faktorStichtag: IsoDatum | null;
    preis: Decimal | null;
  };
  marktwert: { wert: Decimal; stichtag: IsoDatum; quelle: string | null } | null;
  gutachten: { wert: Decimal; stichtag: IsoDatum; gutachter: string | null } | null;
}

export function preisvorschlaege(h: HausDaten, bewertung: HausBewertung, faktorGutachten: Rohertragsfaktor | null, faktorEingabe: Decimal | null, heute: IsoDatum): Preisvorschlaege {
  const sollMonat = hausSummen(h, heute).sollMonat;
  const jahresmiete = jahresNettokaltmiete(sollMonat);
  const faktor = faktorEingabe ?? faktorGutachten?.wert ?? null;
  return {
    miete: {
      sollMonat,
      jahresmiete,
      faktor,
      faktorQuelle: faktorEingabe ? "eingabe" : faktorGutachten ? "gutachten" : null,
      faktorStichtag: faktorEingabe ? null : (faktorGutachten?.stichtag ?? null),
      preis: faktor && !jahresmiete.isZero() ? aufCent(jahresmiete.times(faktor)) : null,
    },
    marktwert: bewertung.marktwert ? { wert: bewertung.marktwert.wert, stichtag: bewertung.marktwert.stichtag, quelle: bewertung.marktwert.quelle } : null,
    gutachten: bewertung.letztes ? { wert: bewertung.letztes.verkehrswert, stichtag: bewertung.letztes.stichtag, gutachter: bewertung.letztes.gutachter } : null,
  };
}

export function gewaehlterPreis(v: Preisvorschlaege, p: Pick<ExitParameter, "basis" | "preis">): Decimal | null {
  switch (p.basis) {
    case "miete":
      return v.miete.preis;
    case "marktwert":
      return v.marktwert?.wert ?? null;
    case "gutachten":
      return v.gutachten?.wert ?? null;
    case "frei":
      return p.preis;
  }
}

export type RestschuldHerkunft = "belegt" | "tilgungsplan" | "berechnet";

export interface KreditAbloese {
  kreditId: string;
  /** Anteil des Hauses am Kredit in Prozent */
  anteilProzent: Decimal;
  restschuld: Decimal | null;
  herkunft: RestschuldHerkunft | null;
  /** Stichtag des Belegs bzw. Verkaufsdatum beim Planwert */
  stichtag: IsoDatum | null;
  abloese: Decimal | null;
  /** Festzins mit Zinsbindung über das Verkaufsdatum hinaus */
  vfePflichtig: boolean;
  vfe: Decimal | null;
}

/** Restschuld zum Verkaufsdatum: bis heute belegt, danach Planwert. */
export function restschuldZum(
  k: KreditDaten,
  datum: IsoDatum,
  heute: IsoDatum,
  referenzwerte: ReferenzWert[],
): { betrag: Decimal; herkunft: RestschuldHerkunft; stichtag: IsoDatum } | null {
  const bis = datum <= heute ? datum : heute;
  const nachweis = restschuldNachweis(k, bis);
  if (datum <= heute) return nachweis ? { betrag: nachweis.betrag, herkunft: "belegt", stichtag: nachweis.stichtag } : null;
  const plan = gueltigerTilgungsplan(k, datum);
  if (plan && plan.zeilen.some((z) => z.faelligAm >= datum)) {
    const bisDatum = plan.zeilen.filter((z) => z.faelligAm <= datum).sort((a, b) => (a.faelligAm < b.faelligAm ? -1 : 1));
    const letzte = bisDatum[bisDatum.length - 1];
    if (letzte) return { betrag: letzte.restschuld, herkunft: "tilgungsplan", stichtag: datum };
  }
  if (!nachweis) return null;
  if (nachweis.betrag.isZero()) return { betrag: nachweis.betrag, herkunft: "belegt", stichtag: nachweis.stichtag };
  const satz = zinssatz(k, referenzwerte, heute);
  if (satz === null) return null;
  // Laufzeitende vor dem Verkauf: Restschuld ist dann fällig (Planwert 0)
  if (k.laufzeitBis && k.laufzeitBis < datum) return { betrag: dezimal(0), herkunft: "berechnet", stichtag: datum };
  const zeilen = berechneTilgungsplan({
    saldo: nachweis.betrag,
    ab: plusTage(nachweis.stichtag, 1),
    zinssatz: satz,
    zahlweise: k.zahlweise,
    tilgungsart: k.tilgungsart,
    ratenbetrag: k.ratenbetrag,
    tilgungProzent: k.anfaenglicheTilgung ? k.ursprungsbetrag.times(k.anfaenglicheTilgung).dividedBy(nachweis.betrag) : null,
    bis: datum,
  });
  const letzte = zeilen[zeilen.length - 1];
  return { betrag: letzte ? letzte.restschuld : nachweis.betrag, herkunft: "berechnet", stichtag: datum };
}

export interface ExitErgebnis {
  preis: Decimal | null;
  makler: Decimal | null;
  sonstige: Decimal | null;
  nettoErloes: Decimal | null;
  kredite: KreditAbloese[];
  abloese: Decimal | null;
  vfe: Decimal | null;
  /** Erlös nach Kreditablöse und Kosten (vor Steuern) */
  ergebnis: Decimal | null;
  /** Kaufpreis + Ist-Kosten der Investitionen */
  einstand: Decimal | null;
  /** Netto-Erlös − Einstand (vor Steuern, ohne laufende Erträge) */
  wertzuwachs: Decimal | null;
  luecken: Array<"preis" | "restschuld" | "vfe" | "kaufpreis">;
}

export function rechneExit(
  hausId: string,
  preis: Decimal | null,
  p: ExitParameter,
  kredite: KreditDaten[],
  referenzwerte: ReferenzWert[],
  heute: IsoDatum,
  einstand: { kaufpreis: Decimal | null; investitionen: Decimal },
): ExitErgebnis {
  const luecken: ExitErgebnis["luecken"] = [];
  const makler = preis ? aufCent(preis.times(p.maklerProzent).dividedBy(100)) : null;
  const sonstige = preis ? aufCent(preis.times(p.sonstigeProzent).dividedBy(100)) : null;
  const nettoErloes = preis ? preis.minus(makler!).minus(sonstige!) : null;
  if (!preis) luecken.push("preis");

  const abl: KreditAbloese[] = kredite
    .filter((k) => k.haeuser.some((x) => x.hausId === hausId))
    .map((k) => {
      const anteilProzent = k.haeuser.find((x) => x.hausId === hausId)!.anteilProzent;
      const r = restschuldZum(k, p.verkaufsdatum, heute, referenzwerte);
      const abloese = r ? aufCent(r.betrag.times(anteilProzent).dividedBy(100)) : null;
      const vfePflichtig = k.zinsArt === "FEST" && !!k.zinsbindungBis && k.zinsbindungBis > p.verkaufsdatum && (abloese === null || abloese.greaterThan(0));
      const vfe = !vfePflichtig ? dezimal(0) : abloese !== null && p.vfeProzent !== null ? aufCent(abloese.times(p.vfeProzent).dividedBy(100)) : null;
      return { kreditId: k.id, anteilProzent, restschuld: r?.betrag ?? null, herkunft: r?.herkunft ?? null, stichtag: r?.stichtag ?? null, abloese, vfePflichtig, vfe };
    });
  const summe = (f: (x: KreditAbloese) => Decimal | null) => (abl.some((x) => f(x) === null) ? null : abl.reduce((s, x) => s.plus(f(x)!), dezimal(0)));
  const abloese = summe((x) => x.abloese);
  const vfe = summe((x) => x.vfe);
  if (abloese === null) luecken.push("restschuld");
  if (vfe === null) luecken.push("vfe");
  const ergebnis = nettoErloes && abloese && vfe ? nettoErloes.minus(abloese).minus(vfe) : null;
  const einstandSumme = einstand.kaufpreis ? einstand.kaufpreis.plus(einstand.investitionen) : null;
  if (!einstand.kaufpreis) luecken.push("kaufpreis");
  return {
    preis,
    makler,
    sonstige,
    nettoErloes,
    kredite: abl,
    abloese,
    vfe,
    ergebnis,
    einstand: einstandSumme,
    wertzuwachs: nettoErloes && einstandSumme ? nettoErloes.minus(einstandSumme) : null,
    luecken,
  };
}

/** Monate vom heutigen Tag bis zum Verkauf (negativ = Vergangenheit). */
export const monateBisVerkauf = (heute: IsoDatum, datum: IsoDatum) => monatsNummer(datum) - monatsNummer(heute);
