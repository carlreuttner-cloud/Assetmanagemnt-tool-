/**
 * Kreditberechnungen: Restschuld, aktueller Zinssatz, Kapitaldienst, Zinsbindung,
 * Tilgungspläne. Reine Funktionen ohne Datenbankzugriff (testbar, auch für Szenarien).
 *
 * Alle Beträge als Decimal, Zinssätze in Prozentpunkten (3.125 = 3,125 %).
 */
import { aufCent, Decimal, dezimal } from "./geld";
import { monatsende, monatsNummer, plusMonate, plusTage, type IsoDatum } from "./datum";

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

export type SaldoArt = "DARLEHEN" | "GUTHABEN";
export type SaldoQuelle = "KONTOAUSZUG" | "BANKBESTAETIGUNG" | "JAHRESABSCHLUSS" | "SONSTIGE";
export type SaldoStatus = "BELEGT" | "ENTWURF";

/** Belegter Saldo (Restschuld oder Guthaben) zu einem Stichtag; `stichtag` null = unklar. */
export interface SaldoDaten {
  id?: string;
  stichtag: IsoDatum | null;
  stichtagHinweis?: string | null;
  art: SaldoArt;
  betrag: Decimal;
  quelle: SaldoQuelle;
  quelleText?: string | null;
  status: SaldoStatus;
}

export interface ReferenzWert {
  referenz: string;
  stichtag: IsoDatum;
  satz: Decimal;
}

export type ZinssicherungArt = "CAP" | "SWAP";

/** Cap oder Swap zu einem variablen Kredit; `nominal` null = gesamte Restschuld. */
export interface ZinssicherungDaten {
  id: string;
  art: ZinssicherungArt;
  satz: Decimal;
  nominal: Decimal | null;
  beginn: IsoDatum;
  ende: IsoDatum;
  bank?: string | null;
  quelle?: string | null;
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
  /** Belegte Salden; fehlt das Feld, gibt es keine */
  salden?: SaldoDaten[];
  tilgungsplaene: TilgungsplanDaten[];
  /** Zinssicherungen (nur bei variablen Krediten wirksam); fehlt das Feld, gibt es keine */
  sicherungen?: ZinssicherungDaten[];
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
 * Herkunft einer Restschuld:
 * - "saldo": belegter Saldo (Kontoauszug, Saldenbestätigung, Jahresabschluss),
 * - "buchung": Kontostand nach einer Bankbuchung (aus dem Kontoauszug bzw. Import),
 * - "nichtAusgezahlt": der Kredit ist am Stichtag noch nicht ausgezahlt (Restschuld 0).
 */
export interface RestschuldNachweis {
  betrag: Decimal;
  /** Stichtag des Belegs (kann vor dem gefragten Stichtag liegen) */
  stichtag: IsoDatum;
  herkunft: "saldo" | "buchung" | "nichtAusgezahlt";
  quelle: SaldoQuelle | null;
  quelleText: string | null;
}

/**
 * Restschuld am Stichtag, nur aus Belegen: der jüngste belegte Darlehenssaldo oder
 * Kontostand nach einer Bankbuchung bis zum Stichtag; bei gleichem Datum gewinnt der Saldo.
 * Entwürfe, Salden mit unklarem Stichtag, Guthaben, Tilgungspläne und Buchungssummen zählen
 * nicht. Ohne Beleg: null (unbekannt).
 */
export function restschuldNachweis(k: KreditDaten, stichtag: IsoDatum): RestschuldNachweis | null {
  if (k.auszahlungsdatum && k.auszahlungsdatum > stichtag) {
    return { betrag: NULL, stichtag, herkunft: "nichtAusgezahlt", quelle: null, quelleText: null };
  }
  let best: RestschuldNachweis | null = null;
  for (const s of k.salden ?? []) {
    if (s.art !== "DARLEHEN" || s.status !== "BELEGT" || !s.stichtag || s.stichtag > stichtag) continue;
    if (!best || s.stichtag > best.stichtag) {
      best = { betrag: s.betrag, stichtag: s.stichtag, herkunft: "saldo", quelle: s.quelle, quelleText: s.quelleText ?? null };
    }
  }
  const mitSaldo = sortiereBuchungen(k.buchungen.filter((b) => b.saldoNach !== null && b.datum <= stichtag));
  const letzte = mitSaldo[mitSaldo.length - 1];
  if (letzte && (!best || letzte.datum > best.stichtag)) {
    best = { betrag: dezimal(letzte.saldoNach!), stichtag: letzte.datum, herkunft: "buchung", quelle: "KONTOAUSZUG", quelleText: null };
  }
  return best;
}

/** Belegte Restschuld am Stichtag oder null (unbekannt), siehe `restschuldNachweis`. */
export function restschuld(k: KreditDaten, stichtag: IsoDatum): Decimal | null {
  return restschuldNachweis(k, stichtag)?.betrag ?? null;
}

/** Restschuld laut gültigem Tilgungsplan (Planwert, kein Beleg) oder null. */
export function planRestschuld(k: KreditDaten, stichtag: IsoDatum): Decimal | null {
  if (k.auszahlungsdatum && k.auszahlungsdatum > stichtag) return NULL;
  const plan = gueltigerTilgungsplan(k, stichtag);
  let letzte: PlanZeileDaten | undefined;
  for (const z of plan?.zeilen ?? []) if (z.faelligAm <= stichtag && (!letzte || z.faelligAm >= letzte.faelligAm)) letzte = z;
  return letzte?.restschuld ?? null;
}

export interface SaldoJahr {
  jahr: number;
  /** jüngster Saldo des Jahres (belegt vor Entwurf bei gleichem Datum) */
  saldo: SaldoDaten & { stichtag: IsoDatum; herkunft: "saldo" | "buchung" };
  /** Veränderung zum Vorjahr (nur wenn beide Jahre einen Saldo haben) */
  veraenderung: Decimal | null;
  /** Restschuld laut Tilgungsplan zum selben Stichtag, zum Vergleich */
  plan: Decimal | null;
  /** Entwürfe desselben Jahres, die nicht gewählt wurden (z. B. weil ein belegter Wert vorliegt) */
  entwuerfe: SaldoDaten[];
}

/**
 * Jahresvergleich der Salden einer Art: je Kalenderjahr der jüngste Saldo (belegte Salden und
 * Kontostände aus Bankbuchungen; Entwürfe gekennzeichnet). Salden ohne Stichtag stehen in `unklar`.
 */
export function saldenJahresvergleich(k: KreditDaten, art: SaldoArt = "DARLEHEN"): { jahre: SaldoJahr[]; unklar: SaldoDaten[] } {
  type Kandidat = SaldoJahr["saldo"];
  const kandidaten: Kandidat[] = [];
  const unklar: SaldoDaten[] = [];
  for (const s of k.salden ?? []) {
    if (s.art !== art) continue;
    if (!s.stichtag) unklar.push(s);
    else kandidaten.push({ ...s, stichtag: s.stichtag, herkunft: "saldo" });
  }
  if (art === "DARLEHEN") {
    // je Tag nur der Kontostand nach der letzten Buchung (Tilgung nach Zins)
    const letzteJeTag = new Map<IsoDatum, BuchungDaten>();
    for (const b of sortiereBuchungen(k.buchungen)) if (b.saldoNach !== null) letzteJeTag.set(b.datum, b);
    for (const b of letzteJeTag.values()) {
      if (b.saldoNach === null) continue;
      kandidaten.push({ stichtag: b.datum, art, betrag: b.saldoNach, quelle: "KONTOAUSZUG", quelleText: null, status: "BELEGT", herkunft: "buchung" });
    }
  }
  const rang = (c: Kandidat) => (c.herkunft === "saldo" ? 0 : 1) + (c.status === "BELEGT" ? 0 : 2);
  const besser = (a: Kandidat, b: Kandidat) => (a.stichtag !== b.stichtag ? a.stichtag > b.stichtag : rang(a) < rang(b));
  const proJahr = new Map<number, Kandidat>();
  for (const c of kandidaten) {
    const jahr = Number(c.stichtag.slice(0, 4));
    const bisher = proJahr.get(jahr);
    if (!bisher || besser(c, bisher)) proJahr.set(jahr, c);
  }
  const jahre = [...proJahr.entries()].sort((a, b) => a[0] - b[0]);
  return {
    jahre: jahre.map(([jahr, saldo], i) => {
      const vorjahr = i > 0 && jahre[i - 1][0] === jahr - 1 ? jahre[i - 1][1] : null;
      return {
        jahr,
        saldo,
        veraenderung: vorjahr ? saldo.betrag.minus(vorjahr.betrag) : null,
        plan: art === "DARLEHEN" ? planRestschuld(k, saldo.stichtag) : null,
        entwuerfe: kandidaten.filter((c) => c !== saldo && c.status === "ENTWURF" && c.stichtag.startsWith(String(jahr))),
      };
    }),
    unklar,
  };
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
 * Fest: Sollzins. Variabel: Referenzzins (mindestens 0 %, übliche Floor-Klausel) plus Marge,
 * mit den am Stichtag laufenden Zinssicherungen (siehe `gesicherterSatz`).
 * null, wenn die Angaben fehlen.
 */
export function zinssatz(
  k: Pick<KreditDaten, "zinsArt" | "sollzins" | "referenzzins" | "marge"> & Partial<KreditDaten>,
  referenzwerte: ReferenzWert[],
  stichtag: IsoDatum,
): Decimal | null {
  if (k.zinsArt === "FEST") return k.sollzins;
  if (!k.referenzzins) return null;
  const ref = referenzzinsAm(referenzwerte, k.referenzzins, stichtag);
  if (!ref) return null;
  const braucheSaldo = aktiveSicherungen(k, stichtag).some((x) => x.nominal !== null);
  const saldo = braucheSaldo && k.buchungen ? restschuld(k as KreditDaten, stichtag) : null;
  return gesicherterSatz(k, ref.satz, stichtag, saldo)?.satz ?? null;
}

/** Zinssicherungen, die am Stichtag laufen (Beginn und Ende einschließlich). */
export function aktiveSicherungen(k: Pick<KreditDaten, "sicherungen">, stichtag: IsoDatum): ZinssicherungDaten[] {
  return (k.sicherungen ?? []).filter((x) => x.beginn <= stichtag && x.ende >= stichtag);
}

export interface SicherungsTeil {
  sicherung: ZinssicherungDaten | null;
  /** Anteil an der Restschuld (0 bis 1) */
  anteil: Decimal;
  /** wirksamer Referenzzins dieses Teils */
  referenz: Decimal;
  satz: Decimal;
}

export interface GesicherterSatz {
  satz: Decimal;
  /** Satz ohne Sicherung: Referenzzins (mindestens 0 %) + Marge */
  ungesichert: Decimal;
  teile: SicherungsTeil[];
}

/**
 * Zinssatz eines variablen Kredits mit Zinssicherungen, gewichtet nach dem gesicherten Anteil
 * der Restschuld. Erst Swaps, dann Caps; ohne Nominal deckt eine Sicherung die restliche Schuld.
 * - Cap: Referenzzins höchstens bis zum Cap-Satz.
 * - Swap: Der Kreditnehmer zahlt den festen Swap-Satz und erhält den Referenzzins; mit dem
 *   0-%-Floor im Kredit ist der wirksame Referenzzins Swap-Satz + max(Ref, 0) − Ref.
 * null, wenn eine Sicherung ein Nominal hat, aber die Restschuld unbekannt ist.
 */
export function gesicherterSatz(
  k: Pick<KreditDaten, "marge" | "sicherungen">,
  referenz: Decimal,
  stichtag: IsoDatum,
  saldo: Decimal | null,
): GesicherterSatz | null {
  const marge = k.marge ?? NULL;
  const basis = Decimal.max(referenz, 0);
  const ungesichert = basis.plus(marge);
  const aktiv = aktiveSicherungen(k, stichtag).sort((a, b) => (a.art === b.art ? a.beginn.localeCompare(b.beginn) : a.art === "SWAP" ? -1 : 1));
  const teile: SicherungsTeil[] = [];
  let rest = dezimal(1);
  for (const x of aktiv) {
    if (rest.lessThanOrEqualTo(0)) break;
    let anteil = rest;
    if (x.nominal !== null) {
      if (saldo === null) return null;
      anteil = saldo.isZero() ? NULL : Decimal.min(x.nominal.dividedBy(saldo), rest);
    }
    if (anteil.isZero()) continue;
    const ref = x.art === "SWAP" ? x.satz.plus(basis).minus(referenz) : Decimal.min(basis, x.satz);
    teile.push({ sicherung: x, anteil, referenz: ref, satz: ref.plus(marge) });
    rest = rest.minus(anteil);
  }
  if (rest.greaterThan(0)) teile.push({ sicherung: null, anteil: rest, referenz: basis, satz: ungesichert });
  const satz = teile.reduce((s, t) => s.plus(t.anteil.times(t.satz)), NULL);
  return { satz, ungesichert, teile };
}

export interface Kapitaldienst {
  zins: Decimal;
  tilgung: Decimal;
  summe: Decimal;
  /** "buchungen": Summe der letzten 12 Monate; "schaetzung": aus Rate und Zinssatz hochgerechnet */
  quelle: "buchungen" | "schaetzung";
  /** Zeitraum der Buchungen bzw. Grundlage der Hochrechnung */
  von?: IsoDatum;
  bis?: IsoDatum;
  saldo?: Decimal;
  zinssatz?: Decimal;
}

/**
 * Kapitaldienst (Zins + planmäßige Tilgung) der letzten 12 Monate bis zum Stichtag.
 * Sondertilgungen zählen nicht dazu. Liegen im Zeitraum keine Buchungen vor oder ist der
 * Kredit jünger als 12 Monate, wird aus Rate und Zinssatz auf ein Jahr hochgerechnet.
 */
export function kapitaldienstJahr(k: KreditDaten, referenzwerte: ReferenzWert[], stichtag: IsoDatum): Kapitaldienst | null {
  const ab = plusMonate(stichtag, -12);
  const imZeitraum = k.buchungen.filter((b) => b.datum > ab && b.datum <= stichtag);
  const vollesJahr = !k.auszahlungsdatum || k.auszahlungsdatum <= ab;
  if (imZeitraum.length > 0 && vollesJahr) {
    const zins = imZeitraum.filter((b) => b.art === "ZINS").reduce((s, b) => s.plus(b.betrag), NULL);
    const tilgung = imZeitraum.filter((b) => b.art === "TILGUNG").reduce((s, b) => s.plus(b.betrag), NULL);
    return { zins, tilgung, summe: zins.plus(tilgung), quelle: "buchungen", von: plusTage(ab, 1), bis: stichtag };
  }
  // Hochrechnung nur mit bekannter Restschuld und bekanntem Zinssatz, sonst unbekannt.
  const saldo = restschuld(k, stichtag);
  const satz = zinssatz(k, referenzwerte, stichtag);
  if (saldo === null || satz === null) return null;
  return { ...geschaetzterKapitaldienst(k, saldo, satz), saldo, zinssatz: satz };
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
