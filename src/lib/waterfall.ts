/**
 * Verkaufs-Waterfall: Verteilung eines Verkaufserlöses einer Gesellschaft. Reine Funktionen.
 *
 * Reihenfolge:
 *   Verkaufspreis − Verkaufskosten − Ablösung der Bankdarlehen − Vorfälligkeitsentschädigung − Steuern = Netto-Erlös
 *   0. Nachrang- und Gesellschafterdarlehen nach Rang (gleicher Rang anteilig, ohne Rang zuletzt)
 *   1. Rückzahlung der Einlagen (anteilig nach offenem Einlagensaldo)
 *   2. Vorzugsrendite auf das eingezahlte Kapital (anteilig nach offener Vorzugsrendite)
 *   3. Gewinnverteilung des Rests nach den vertraglichen Gewinnanteilen
 *
 * Es wird nichts geschätzt: Fehlt eine Angabe (Saldo eines Kredits, Vorfälligkeit, Verkaufskosten,
 * Steuern, Einzahlungen, Vertragsregeln, Gewinnanteile), wird sie als Lücke gemeldet und alles,
 * was davon abhängt, bleibt unbekannt (null).
 */
import { aufCent, dezimal, type Decimal } from "./geld";
import type { IsoDatum } from "./datum";

export type LueckenArt =
  | "preis"
  | "verkaufskosten"
  | "restschuld"
  | "vorfaelligkeit"
  | "steuern"
  | "keineGesellschafter"
  | "einzahlungen"
  | "einzahlungsdatum"
  | "vertrag"
  | "gewinnanteile";

export interface Luecke {
  art: LueckenArt;
  /** Name des Hauses, Kredits oder Gesellschafters */
  bezug?: string;
}

export interface WaterfallVerkauf {
  hausId: string;
  name: string;
  preis: Decimal | null;
  /** true, wenn der Preis eine Annahme (z. B. letzter Verkehrswert) statt einer Eingabe ist */
  preisAnnahme: boolean;
}

export type WaterfallKreditArt = "BANK" | "GESELLSCHAFTERDARLEHEN" | "NACHRANGDARLEHEN";

export interface WaterfallKredit {
  id: string;
  name: string;
  /** fehlt = Bankdarlehen */
  art?: WaterfallKreditArt;
  /** Rang bei Nachrang- und Gesellschafterdarlehen (1 = zuerst); null = zuletzt */
  rang?: number | null;
  /** Darlehensgeber bei Gesellschafterdarlehen */
  gesellschafterId?: string | null;
  /** Summe der Anteile der verkauften Häuser an diesem Kredit in Prozent */
  anteilProzent: Decimal;
  /** belegte Restschuld (ganzer Kredit) oder null */
  restschuld: Decimal | null;
  restschuldStichtag: IsoDatum | null;
  /** Vorfälligkeitsentschädigung als Eingabe; null = nicht erfasst */
  vorfaelligkeit: Decimal | null;
}

export interface WaterfallBewegung {
  art: "EINLAGE" | "RUECKZAHLUNG" | "AUSSCHUETTUNG";
  datum: IsoDatum | null;
  betrag: Decimal;
}

export interface WaterfallGesellschafter {
  id: string;
  name: string;
  gewinnanteilProzent: Decimal | null;
  bewegungen: WaterfallBewegung[];
}

export interface WaterfallVertrag {
  vorzugsrenditeProzent: Decimal;
  verzinsung: "EINFACH" | "ZINSESZINS";
  ausschuettungenAnrechnen: boolean;
}

export interface WaterfallEingabe {
  datum: IsoDatum;
  verkaeufe: WaterfallVerkauf[];
  /** Verkaufskosten in Prozent des Preises; null = nicht erfasst */
  verkaufskostenProzent: Decimal | null;
  kredite: WaterfallKredit[];
  /** Steuern auf den Veräußerungsgewinn; null = nicht erfasst */
  steuern: Decimal | null;
  gesellschafter: WaterfallGesellschafter[];
  vertrag: WaterfallVertrag | null;
}

export interface GesellschafterAnteil {
  id: string;
  name: string;
  einlagen: Decimal;
  rueckzahlungenBisher: Decimal;
  ausschuettungenBisher: Decimal;
  offeneEinlage: Decimal;
  offeneVorzugsrendite: Decimal | null;
  /** Rückzahlung eigener Gesellschafterdarlehen; 0 ohne Darlehen */
  darlehen: Decimal | null;
  rueckzahlung: Decimal | null;
  vorzugsrendite: Decimal | null;
  gewinn: Decimal | null;
  summe: Decimal | null;
  /** (Summe + bisherige Rückzahlungen und Ausschüttungen) ÷ Einlagen; ohne Darlehen */
  multiple: Decimal | null;
  /** Summe + Darlehen */
  gesamt: Decimal | null;
}

export interface KreditAbloesung {
  id: string;
  name: string;
  anteilProzent: Decimal;
  restschuld: Decimal | null;
  restschuldStichtag: IsoDatum | null;
  abloesung: Decimal | null;
  vorfaelligkeit: Decimal | null;
  art: WaterfallKreditArt;
  rang: number | null;
  nachrangig: boolean;
  /** bei nachrangigen Darlehen: tatsächlich aus dem Netto-Erlös gezahlt */
  gezahlt: Decimal | null;
}

export interface WaterfallErgebnis {
  verkaufspreis: Decimal | null;
  verkaufskosten: Decimal | null;
  /** Ablösung der Bankdarlehen */
  kreditabloesung: Decimal | null;
  vorfaelligkeit: Decimal | null;
  steuern: Decimal | null;
  nettoErloes: Decimal | null;
  kredite: KreditAbloesung[];
  stufen: { nachrang: Decimal | null; rueckzahlung: Decimal | null; vorzugsrendite: Decimal | null; gewinn: Decimal | null };
  /** Netto-Erlös reicht nicht für alle nachrangigen Darlehen */
  nachrangUnterdeckung: boolean;
  gesellschafter: GesellschafterAnteil[];
  luecken: Luecke[];
  /** Netto-Erlös reicht nicht für die Rückzahlung der Einlagen */
  unterdeckung: boolean;
}

const null0 = () => dezimal(0);
const summe = (werte: Decimal[]) => werte.reduce((s, w) => s.plus(w), null0());
const summeOderNull = (werte: Array<Decimal | null>) => (werte.some((w) => w === null) ? null : summe(werte as Decimal[]));

/** Tage zwischen zwei ISO-Daten. */
function tage(von: IsoDatum, bis: IsoDatum) {
  return Math.round((Date.parse(`${bis}T00:00:00Z`) - Date.parse(`${von}T00:00:00Z`)) / 86_400_000);
}

/** Vorzugsrendite einer Zahlung bis zum Stichtag (Act/365). */
export function verzinsung(betrag: Decimal, von: IsoDatum, bis: IsoDatum, satzProzent: Decimal, art: "EINFACH" | "ZINSESZINS"): Decimal {
  const t = Math.max(0, tage(von, bis));
  const p = satzProzent.dividedBy(100);
  if (art === "EINFACH") return betrag.times(p).times(t).dividedBy(365);
  return betrag.times(p.plus(1).pow(dezimal(t).dividedBy(365)).minus(1));
}

/** Verteilt einen Betrag anteilig nach Gewichten; die Rundungsdifferenz geht an den größten Anteil. */
function verteile(betrag: Decimal, gewichte: Decimal[]): Decimal[] {
  const gesamt = summe(gewichte);
  if (gesamt.isZero()) return gewichte.map(() => null0());
  const teile = gewichte.map((g) => aufCent(betrag.times(g).dividedBy(gesamt)));
  const rest = aufCent(betrag).minus(summe(teile));
  if (!rest.isZero()) {
    const i = gewichte.reduce((m, g, j) => (g.greaterThan(gewichte[m]) ? j : m), 0);
    teile[i] = teile[i].plus(rest);
  }
  return teile;
}

export function rechneWaterfall(e: WaterfallEingabe): WaterfallErgebnis {
  const luecken: Luecke[] = [];
  for (const v of e.verkaeufe) if (v.preis === null) luecken.push({ art: "preis", bezug: v.name });
  const verkaufspreis = summeOderNull(e.verkaeufe.map((v) => v.preis));
  if (e.verkaufskostenProzent === null) luecken.push({ art: "verkaufskosten" });
  const verkaufskosten = verkaufspreis && e.verkaufskostenProzent ? aufCent(verkaufspreis.times(e.verkaufskostenProzent).dividedBy(100)) : null;

  const kredite: KreditAbloesung[] = e.kredite.map((k) => {
    if (k.restschuld === null) luecken.push({ art: "restschuld", bezug: k.name });
    if (k.vorfaelligkeit === null) luecken.push({ art: "vorfaelligkeit", bezug: k.name });
    const art = k.art ?? "BANK";
    return {
      id: k.id,
      name: k.name,
      anteilProzent: k.anteilProzent,
      restschuld: k.restschuld,
      restschuldStichtag: k.restschuldStichtag,
      abloesung: k.restschuld ? aufCent(k.restschuld.times(k.anteilProzent).dividedBy(100)) : null,
      vorfaelligkeit: k.vorfaelligkeit,
      art,
      rang: k.rang ?? null,
      nachrangig: art !== "BANK",
      gezahlt: null,
    };
  });
  const bank = kredite.filter((k) => !k.nachrangig);
  const nachrangige = kredite.filter((k) => k.nachrangig);
  const kreditabloesung = summeOderNull(bank.map((k) => k.abloesung));
  const vorfaelligkeit = summeOderNull(kredite.map((k) => k.vorfaelligkeit));
  if (e.steuern === null) luecken.push({ art: "steuern" });
  const nettoErloes =
    verkaufspreis && verkaufskosten && kreditabloesung && vorfaelligkeit && e.steuern
      ? verkaufspreis.minus(verkaufskosten).minus(kreditabloesung).minus(vorfaelligkeit).minus(e.steuern)
      : null;

  // Stufe 0: nachrangige Darlehen nach Rang aus dem Netto-Erlös
  let verfuegbar: Decimal | null = nettoErloes === null ? null : nettoErloes.isNegative() ? null0() : nettoErloes;
  let nachrangSumme: Decimal | null = nachrangige.length === 0 ? null0() : null;
  let nachrangUnterdeckung = false;
  if (verfuegbar !== null && nachrangige.every((k) => k.abloesung !== null)) {
    const raenge = [...new Set(nachrangige.map((k) => k.rang ?? Number.MAX_SAFE_INTEGER))].sort((a, b) => a - b);
    let gezahlt = null0();
    for (const r of raenge) {
      const gruppe = nachrangige.filter((k) => (k.rang ?? Number.MAX_SAFE_INTEGER) === r);
      const forderung = summe(gruppe.map((k) => k.abloesung!));
      const zahlung = kleiner(verfuegbar, forderung);
      if (zahlung.lessThan(forderung)) nachrangUnterdeckung = true;
      verteile(zahlung, gruppe.map((k) => k.abloesung!)).forEach((z, i) => (gruppe[i].gezahlt = z));
      verfuegbar = verfuegbar.minus(zahlung);
      gezahlt = gezahlt.plus(zahlung);
    }
    nachrangSumme = gezahlt;
  } else if (nachrangige.length > 0) {
    verfuegbar = null;
  }

  // Gesellschafter: Einlagen, bisherige Rückflüsse
  if (e.gesellschafter.length === 0) luecken.push({ art: "keineGesellschafter" });
  const basis = e.gesellschafter.map((g) => {
    const von = (art: WaterfallBewegung["art"]) => summe(g.bewegungen.filter((b) => b.art === art).map((b) => b.betrag));
    const einlagen = von("EINLAGE");
    const rueckzahlungenBisher = von("RUECKZAHLUNG");
    const ausschuettungenBisher = von("AUSSCHUETTUNG");
    if (!g.bewegungen.some((b) => b.art === "EINLAGE")) luecken.push({ art: "einzahlungen", bezug: g.name });
    return { g, einlagen, rueckzahlungenBisher, ausschuettungenBisher, offeneEinlage: einlagen.minus(rueckzahlungenBisher) };
  });
  const einzahlungenBekannt = e.gesellschafter.length > 0 && basis.every((b) => b.g.bewegungen.some((x) => x.art === "EINLAGE"));
  if (!e.vertrag) luecken.push({ art: "vertrag" });

  // Offene Vorzugsrendite je Gesellschafter
  const offeneVorzug = basis.map(({ g, ausschuettungenBisher }) => {
    if (!e.vertrag) return null;
    if (e.vertrag.vorzugsrenditeProzent.isZero()) return null0();
    let wert = null0();
    for (const b of g.bewegungen) {
      if (b.art === "AUSSCHUETTUNG") continue;
      if (!b.datum) {
        luecken.push({ art: "einzahlungsdatum", bezug: g.name });
        return null;
      }
      const z = verzinsung(b.betrag, b.datum, e.datum, e.vertrag.vorzugsrenditeProzent, e.vertrag.verzinsung);
      wert = b.art === "EINLAGE" ? wert.plus(z) : wert.minus(z);
    }
    if (e.vertrag.ausschuettungenAnrechnen) wert = wert.minus(ausschuettungenBisher);
    return aufCent(wert.isNegative() ? null0() : wert);
  });

  const gewinnBekannt =
    e.gesellschafter.length > 0 &&
    e.gesellschafter.every((g) => g.gewinnanteilProzent !== null) &&
    summe(e.gesellschafter.map((g) => g.gewinnanteilProzent!)).equals(100);
  if (e.gesellschafter.length > 0 && !gewinnBekannt) luecken.push({ art: "gewinnanteile" });

  // Verteilung
  let rueckzahlung: Decimal[] | null = null;
  let vorzug: Decimal[] | null = null;
  let gewinn: Decimal[] | null = null;
  let unterdeckung = false;
  if (verfuegbar !== null && einzahlungenBekannt && e.vertrag) {
    let rest = verfuegbar;
    const offen = basis.map((b) => (b.offeneEinlage.isNegative() ? null0() : b.offeneEinlage));
    const stufe1 = kleiner(rest, summe(offen));
    unterdeckung = rest.lessThan(summe(offen));
    rueckzahlung = verteile(stufe1, offen);
    rest = rest.minus(summe(rueckzahlung));
    if (offeneVorzug.every((v) => v !== null)) {
      const pref = offeneVorzug as Decimal[];
      vorzug = verteile(kleiner(rest, summe(pref)), pref);
      rest = rest.minus(summe(vorzug));
      if (gewinnBekannt) gewinn = verteile(rest, e.gesellschafter.map((g) => g.gewinnanteilProzent!));
    }
  }

  const gesellschafter: GesellschafterAnteil[] = basis.map((b, i) => {
    const s = rueckzahlung && vorzug && gewinn ? rueckzahlung[i].plus(vorzug[i]).plus(gewinn[i]) : null;
    const eigene = nachrangige.filter((k) => k.art === "GESELLSCHAFTERDARLEHEN" && e.kredite.find((x) => x.id === k.id)?.gesellschafterId === b.g.id);
    const darlehen = eigene.some((k) => k.gezahlt === null) ? null : summe(eigene.map((k) => k.gezahlt!));
    return {
      id: b.g.id,
      name: b.g.name,
      einlagen: b.einlagen,
      rueckzahlungenBisher: b.rueckzahlungenBisher,
      ausschuettungenBisher: b.ausschuettungenBisher,
      offeneEinlage: b.offeneEinlage,
      offeneVorzugsrendite: offeneVorzug[i],
      darlehen,
      rueckzahlung: rueckzahlung?.[i] ?? null,
      vorzugsrendite: vorzug?.[i] ?? null,
      gewinn: gewinn?.[i] ?? null,
      summe: s,
      multiple: s && !b.einlagen.isZero() ? s.plus(b.rueckzahlungenBisher).plus(b.ausschuettungenBisher).dividedBy(b.einlagen) : null,
      gesamt: s && darlehen ? s.plus(darlehen) : null,
    };
  });

  // Doppelte Lücken (z. B. mehrfach fehlendes Einzahlungsdatum) zusammenfassen
  const eindeutig = luecken.filter((l, i) => luecken.findIndex((x) => x.art === l.art && x.bezug === l.bezug) === i);

  return {
    verkaufspreis,
    verkaufskosten,
    kreditabloesung,
    vorfaelligkeit,
    steuern: e.steuern,
    nettoErloes,
    kredite,
    nachrangUnterdeckung,
    stufen: { nachrang: nachrangSumme, rueckzahlung: rueckzahlung && summe(rueckzahlung), vorzugsrendite: vorzug && summe(vorzug), gewinn: gewinn && summe(gewinn) },
    gesellschafter,
    luecken: eindeutig,
    unterdeckung,
  };
}

function kleiner(a: Decimal, b: Decimal) {
  return a.lessThan(b) ? a : b;
}
