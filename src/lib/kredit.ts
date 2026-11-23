/**
 * Kreditberechnungen: Restschuld, aktueller Zinssatz, Kapitaldienst, Zinsbindung,
 * Tilgungspläne. Reine Funktionen ohne Datenbankzugriff (testbar, auch für Szenarien).
 *
 * Alle Beträge als Decimal, Zinssätze in Prozentpunkten (3.125 = 3,125 %).
 */
import { aufCent, Decimal, dezimal } from "./geld";
import { monatsende, monatsNummer, plusMonate, type IsoDatum } from "./datum";

export type BuchungsArt = "ZINS" | "TILGUNG" | "SONDERTILGUNG" | "GEBUEHR" | "AUSZAHLUNG" | "SONSTIGES";
export type ZahlweiseArt = "MONATLICH" | "QUARTALSWEISE" | "HALBJAEHRLICH" | "JAEHRLICH";
export type TilgungsartArt = "ANNUITAET" | "RATENTILGUNG" | "ENDFAELLIG";

export interface BuchungDaten {
  datum: IsoDatum;
  art: BuchungsArt;
  betrag: Decimal;
  saldoNach: Decimal | null;
}

export interface PlanZeileDaten {
  faelligAm: IsoDatum;
  zins: Decimal;
  tilgung: Decimal;
  rate: Decimal;
  restschuld: Decimal;
}

export interface TilgungsplanDaten {
  version: number;
  gueltigAb: IsoDatum;
  zeilen: PlanZeileDaten[];
}

export interface ReferenzWert {
  referenz: string;
  stichtag: IsoDatum;
  satz: Decimal;
}

export interface KreditDaten {
  id: string;
  gesellschaftId: string;
  bezeichnung: string;
  zinsArt: "FEST" | "VARIABEL";
  sollzins: Decimal | null;
  referenzzins: string | null;
  marge: Decimal | null;
  ursprungsbetrag: Decimal;
  auszahlungsdatum: IsoDatum | null;
  zinsbindungBis: IsoDatum | null;
  laufzeitBis: IsoDatum | null;
  zahlweise: ZahlweiseArt;
  tilgungsart: TilgungsartArt;
  anfaenglicheTilgung: Decimal | null;
  ratenbetrag: Decimal | null;
  haeuser: { hausId: string; anteilProzent: Decimal }[];
  buchungen: BuchungDaten[];
  tilgungsplaene: TilgungsplanDaten[];
}

const NULL = dezimal(0);

export const PERIODEN_PRO_JAHR: Record<ZahlweiseArt, number> = {
  MONATLICH: 12,
  QUARTALSWEISE: 4,
  HALBJAEHRLICH: 2,
  JAEHRLICH: 1,
};

/** Reihenfolge von Buchungen am selben Tag: erst Auszahlung und Zinsen, dann Tilgungen. */
const REIHENFOLGE: Record<BuchungsArt, number> = {
  AUSZAHLUNG: 0,
  ZINS: 1,
  GEBUEHR: 2,
  SONSTIGES: 3,
  TILGUNG: 4,
  SONDERTILGUNG: 5,
};

/** Buchungen chronologisch, am selben Tag nach `REIHENFOLGE`. */
export function sortiereBuchungen<T extends Pick<BuchungDaten, "datum" | "art">>(buchungen: T[]): T[] {
  return [...buchungen].sort((a, b) =>
    a.datum === b.datum ? REIHENFOLGE[a.art] - REIHENFOLGE[b.art] : a.datum < b.datum ? -1 : 1,
  );
}

/** Der Tilgungsplan, der am Stichtag gilt (höchste Version mit Beginn bis Stichtag). */
export function gueltigerTilgungsplan(k: Pick<KreditDaten, "tilgungsplaene">, stichtag: IsoDatum): TilgungsplanDaten | null {
  const plaene = [...k.tilgungsplaene].sort((a, b) => b.version - a.version);
  return plaene.find((p) => p.gueltigAb <= stichtag) ?? plaene[plaene.length - 1] ?? null;
}

/**
 * Restschuld am Stichtag. Quelle ist die jüngste Angabe aus Buchungen (Saldo nach Buchung)
 * oder dem gültigen Tilgungsplan; bei Gleichstand gewinnt die Buchung.
 * Ohne beides: Ursprungsbetrag (bzw. 0 vor der Auszahlung).
 */
export function restschuld(k: KreditDaten, stichtag: IsoDatum): Decimal {
  if (k.auszahlungsdatum && k.auszahlungsdatum > stichtag) return NULL;

  const mitSaldo = sortiereBuchungen(k.buchungen.filter((b) => b.saldoNach !== null && b.datum <= stichtag));
  const letzteBuchung = mitSaldo[mitSaldo.length - 1];

  const plan = gueltigerTilgungsplan(k, stichtag);
  const planZeilen = (plan?.zeilen ?? []).filter((z) => z.faelligAm <= stichtag);
  const letzteZeile = planZeilen.reduce<PlanZeileDaten | undefined>(
    (l, z) => (!l || z.faelligAm >= l.faelligAm ? z : l),
    undefined,
  );

  if (letzteBuchung && (!letzteZeile || letzteBuchung.datum >= letzteZeile.faelligAm)) {
    return dezimal(letzteBuchung.saldoNach!);
  }
  if (letzteZeile) return letzteZeile.restschuld;
  return k.ursprungsbetrag;
}

/** Letzter bekannter Wert eines Referenzzinses bis zum Stichtag. */
export function referenzzinsAm(werte: ReferenzWert[], referenz: string, stichtag: IsoDatum): ReferenzWert | null {
  let best: ReferenzWert | null = null;
  for (const w of werte) {
    if (w.referenz !== referenz || w.stichtag > stichtag) continue;
    if (!best || w.stichtag > best.stichtag) best = w;
  }
  return best;
}

/**
 * Zinssatz am Stichtag in Prozentpunkten.
 * Fest: Sollzins. Variabel: Referenzzins (mindestens 0 %, übliche Floor-Klausel) plus Marge.
 * null, wenn die Angaben fehlen.
 */
export function zinssatz(
  k: Pick<KreditDaten, "zinsArt" | "sollzins" | "referenzzins" | "marge">,
  referenzwerte: ReferenzWert[],
  stichtag: IsoDatum,
): Decimal | null {
  if (k.zinsArt === "FEST") return k.sollzins;
  if (!k.referenzzins) return null;
  const ref = referenzzinsAm(referenzwerte, k.referenzzins, stichtag);
  if (!ref) return null;
  return Decimal.max(ref.satz, 0).plus(k.marge ?? 0);
}

export interface Kapitaldienst {
  zins: Decimal;
  tilgung: Decimal;
  summe: Decimal;
  /** "buchungen": Summe der letzten 12 Monate; "schaetzung": aus Rate und Zinssatz hochgerechnet */
  quelle: "buchungen" | "schaetzung";
}

/**
 * Kapitaldienst (Zins + planmäßige Tilgung) der letzten 12 Monate bis zum Stichtag.
 * Sondertilgungen zählen nicht dazu. Liegen im Zeitraum keine Buchungen vor oder ist der
 * Kredit jünger als 12 Monate, wird aus Rate und Zinssatz auf ein Jahr hochgerechnet.
 */
export function kapitaldienstJahr(k: KreditDaten, referenzwerte: ReferenzWert[], stichtag: IsoDatum): Kapitaldienst {
  const ab = plusMonate(stichtag, -12);
  const imZeitraum = k.buchungen.filter((b) => b.datum > ab && b.datum <= stichtag);
  const vollesJahr = !k.auszahlungsdatum || k.auszahlungsdatum <= ab;
  if (imZeitraum.length > 0 && vollesJahr) {
    const zins = imZeitraum.filter((b) => b.art === "ZINS").reduce((s, b) => s.plus(b.betrag), NULL);
    const tilgung = imZeitraum.filter((b) => b.art === "TILGUNG").reduce((s, b) => s.plus(b.betrag), NULL);
    return { zins, tilgung, summe: zins.plus(tilgung), quelle: "buchungen" };
  }
  return geschaetzterKapitaldienst(k, restschuld(k, stichtag), zinssatz(k, referenzwerte, stichtag) ?? NULL);
}

/** Hochrechnung des Jahres-Kapitaldiensts aus Restschuld, Zinssatz und Rate. */
export function geschaetzterKapitaldienst(
  k: Pick<KreditDaten, "tilgungsart" | "ratenbetrag" | "zahlweise" | "anfaenglicheTilgung" | "ursprungsbetrag">,
  saldo: Decimal,
  satz: Decimal,
): Kapitaldienst {
  if (saldo.lessThanOrEqualTo(0)) return { zins: NULL, tilgung: NULL, summe: NULL, quelle: "schaetzung" };
  const n = PERIODEN_PRO_JAHR[k.zahlweise];
  const zins = aufCent(saldo.times(satz).dividedBy(100));
  let tilgung = NULL;
  if (k.tilgungsart === "RATENTILGUNG") {
    tilgung = (k.ratenbetrag ?? tilgungAusProzent(k)).times(n);
  } else if (k.tilgungsart === "ANNUITAET") {
    const rate = k.ratenbetrag ? k.ratenbetrag.times(n) : zins.plus(tilgungAusProzent(k).times(n));
    tilgung = Decimal.max(rate.minus(zins), 0);
  }
  tilgung = aufCent(Decimal.min(tilgung, saldo));
  return { zins, tilgung, summe: zins.plus(tilgung), quelle: "schaetzung" };
}

function tilgungAusProzent(k: Pick<KreditDaten, "anfaenglicheTilgung" | "ursprungsbetrag" | "zahlweise">): Decimal {
  if (!k.anfaenglicheTilgung) return NULL;
  return aufCent(k.ursprungsbetrag.times(k.anfaenglicheTilgung).dividedBy(100 * PERIODEN_PRO_JAHR[k.zahlweise]));
}

export type ZinsbindungStufe = "abgelaufen" | "unter12" | "unter24" | "spaeter" | "keine";

/** Wie dringend das Ende der Zinsbindung ist (bei variablen Krediten: keine Bindung). */
export function zinsbindung(
  k: Pick<KreditDaten, "zinsArt" | "zinsbindungBis">,
  stichtag: IsoDatum,
): { bis: IsoDatum | null; stufe: ZinsbindungStufe; monate: number | null } {
  if (k.zinsArt !== "FEST" || !k.zinsbindungBis) return { bis: null, stufe: "keine", monate: null };
  const monate = monatsNummer(k.zinsbindungBis) - monatsNummer(stichtag);
  const stufe: ZinsbindungStufe =
    k.zinsbindungBis < stichtag ? "abgelaufen" : monate <= 12 ? "unter12" : monate <= 24 ? "unter24" : "spaeter";
  return { bis: k.zinsbindungBis, stufe, monate };
}

// ---------------------------------------------------------------------------
// Tilgungsplan berechnen
// ---------------------------------------------------------------------------

export interface PlanVorgabe {
  /** Restschuld zu Beginn */
  saldo: Decimal;
  /** Erster Tag des Plans; die erste Zahlung ist am Ende der ersten Periode */
  ab: IsoDatum;
  /** Zinssatz in Prozentpunkten p. a. */
  zinssatz: Decimal;
  zahlweise: ZahlweiseArt;
  tilgungsart: TilgungsartArt;
  /** Annuität: Rate je Zahlung; Ratentilgung: Tilgung je Zahlung. Ohne Angabe aus `tilgungProzent`. */
  ratenbetrag?: Decimal | null;
  /** Anfängliche Tilgung in Prozent p. a. der Start-Restschuld (wenn kein Ratenbetrag) */
  tilgungProzent?: Decimal | null;
  /** Letzter Tag des Plans (z. B. Ende der Zinsbindung); sonst bis zur vollständigen Tilgung */
  bis?: IsoDatum | null;
  /** Sicherheitsgrenze */
  maxJahre?: number;
}

/** Rate je Zahlung für eine Vorgabe (Annuität: Zins + Tilgung; Ratentilgung: Tilgung). */
export function rateFuer(v: Pick<PlanVorgabe, "saldo" | "zinssatz" | "zahlweise" | "tilgungsart" | "ratenbetrag" | "tilgungProzent">): Decimal {
  if (v.ratenbetrag) return v.ratenbetrag;
  const n = PERIODEN_PRO_JAHR[v.zahlweise];
  const tilgung = v.tilgungProzent ?? NULL;
  if (v.tilgungsart === "ANNUITAET") return aufCent(v.saldo.times(v.zinssatz.plus(tilgung)).dividedBy(100 * n));
  if (v.tilgungsart === "RATENTILGUNG") return aufCent(v.saldo.times(tilgung).dividedBy(100 * n));
  return NULL;
}

/** Rechnet einen Tilgungsplan Periode für Periode (Zins auf Cent gerundet). */
export function berechneTilgungsplan(v: PlanVorgabe): PlanZeileDaten[] {
  const n = PERIODEN_PRO_JAHR[v.zahlweise];
  const schritt = 12 / n;
  const rate = rateFuer(v);
  const zeilen: PlanZeileDaten[] = [];
  let saldo = v.saldo;
  const start = monatsNummer(v.ab);
  const grenze = (v.maxJahre ?? 60) * n;
  const bisNr = v.bis ? monatsNummer(v.bis) : Infinity;

  for (let i = 0; i < grenze && saldo.greaterThan(0); i++) {
    const monat = start + schritt - 1 + i * schritt;
    if (monat > bisNr) break;
    const faelligAm = monatsende(monat);
    const zins = aufCent(saldo.times(v.zinssatz).dividedBy(100 * n));
    let tilgung: Decimal;
    if (v.tilgungsart === "ANNUITAET") tilgung = rate.minus(zins);
    else if (v.tilgungsart === "RATENTILGUNG") tilgung = rate;
    else tilgung = NULL;
    if (tilgung.lessThan(0)) tilgung = NULL; // Rate deckt die Zinsen nicht
    if (tilgung.greaterThan(saldo)) tilgung = saldo;
    saldo = saldo.minus(tilgung);
    zeilen.push({ faelligAm, zins, tilgung, rate: zins.plus(tilgung), restschuld: saldo });
    // Annuität, die die Zinsen nicht deckt, oder endfällig ohne Enddatum: nicht endlos rechnen
    if (tilgung.isZero() && !v.bis && v.tilgungsart !== "ENDFAELLIG") break;
  }
  return zeilen;
}

// ---------------------------------------------------------------------------
// Covenants
// ---------------------------------------------------------------------------

export type CovenantWerte = Partial<Record<"LTV" | "DSCR" | "ICR", Decimal | null>>;

/**
 * Prüft einen Covenant gegen die berechneten Kennzahlen.
 * LTV in Prozent (65 = 65 %), DSCR und ICR als Faktor (1.2).
 * `eingehalten` ist null, wenn die Kennzahl nicht automatisch berechnet werden kann.
 */
export function pruefeCovenant(
  c: { kennzahl: string; vergleich: "HOECHSTENS" | "MINDESTENS" | null; schwellenwert: Decimal | null },
  werte: CovenantWerte,
): { wert: Decimal | null; eingehalten: boolean | null } {
  const schluessel = c.kennzahl.trim().toUpperCase() as keyof CovenantWerte;
  const wert = werte[schluessel] ?? null;
  if (wert === null || !c.vergleich || c.schwellenwert === null) return { wert, eingehalten: null };
  const eingehalten =
    c.vergleich === "HOECHSTENS" ? wert.lessThanOrEqualTo(c.schwellenwert) : wert.greaterThanOrEqualTo(c.schwellenwert);
  return { wert, eingehalten };
}
