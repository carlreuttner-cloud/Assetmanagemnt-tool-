/**
 * Liquiditätsplanung je Gesellschaft: 12 Monate ab dem Folgemonat aus Mieten, Kapitaldienst,
 * Investitionen (Restbudget offener Maßnahmen) und Planpositionen (Ausschüttungen, sonstige
 * Einnahmen und Ausgaben). Reine Funktionen ohne Datenbankzugriff.
 *
 * Regeln:
 * - Anfangsbestand: jüngster belegter Kontostand je Konto bis heute; ohne Kontostand unbekannt.
 * - Mieten: Ist-Nettokaltmiete aller Mietverhältnisse, die am Monatsersten laufen (keine
 *   Mietsteigerung, keine Neuvermietung; Nebenkosten sind durchlaufende Posten und fehlen).
 * - Kapitaldienst: Zeile des gültigen Tilgungsplans im Monat; ohne Plan aus belegter Restschuld,
 *   heutigem Zinssatz und Rate gerechnet (Zahlung am Ende jeder Periode wie in den Szenarien).
 *   Endet die Laufzeit im Planzeitraum, ist die verbleibende Restschuld als Schlusszahlung fällig.
 *   Variable Kredite mit Zinssicherung: heutiger Referenzzins, Cap/Swap nur bis zu ihrem Ende.
 * - Investitionen: Budget − Ist-Kosten geplanter und laufender Maßnahmen, gleichmäßig auf die
 *   Monate bis zum geplanten Ende verteilt. Ohne Budget oder Ende: Datenlücke, nichts geschätzt.
 * - Engpass: Bestand am Monatsende unter 0; Warnung, wenn er unter der Mindestliquidität liegt.
 */
import { aufCent, Decimal, dezimal } from "./geld";
import { monatsanfang, monatsende, monatsNummer, type IsoDatum } from "./datum";
import type { HausDaten } from "./kennzahlen";
import { gesicherterSatz, gueltigerTilgungsplan, PERIODEN_PRO_JAHR, referenzzinsAm, restschuldNachweis, zinssatz, type KreditDaten, type ReferenzWert } from "./kredit";

export type PlanpositionArt = "AUSSCHUETTUNG" | "EINNAHME" | "AUSGABE";

export interface PlanpositionDaten {
  id: string;
  art: PlanpositionArt;
  /** beliebiger Tag im Monat; maßgeblich ist der Monat */
  monat: IsoDatum;
  /** immer positiv */
  betrag: Decimal;
  bezeichnung: string;
}

export interface KontostandDaten {
  id: string;
  konto: string;
  stichtag: IsoDatum;
  betrag: Decimal;
  quelle: string | null;
}

export interface MassnahmePlanDaten {
  id: string;
  bezeichnung: string;
  status: "GEPLANT" | "LAUFEND" | "ABGESCHLOSSEN";
  budget: Decimal | null;
  /** Summe der bisherigen Kostenpositionen */
  ist: Decimal;
  beginn: IsoDatum | null;
  ende: IsoDatum | null;
}

export interface LiquiditaetEingabe {
  haeuser: HausDaten[];
  kredite: KreditDaten[];
  referenzwerte: ReferenzWert[];
  massnahmen: MassnahmePlanDaten[];
  positionen: PlanpositionDaten[];
  kontostaende: KontostandDaten[];
  mindestliquiditaet: Decimal | null;
  heute: IsoDatum;
  monate?: number;
}

export type KapitaldienstQuelle = "tilgungsplan" | "berechnet";

export interface KreditMonat {
  kreditId: string;
  zins: Decimal;
  tilgung: Decimal;
  /** Restschuld am Laufzeitende */
  schluss: Decimal;
  quelle: KapitaldienstQuelle;
}

export type MonatStatus = "engpass" | "unterMindest" | "ok";

export interface LiquiditaetMonat {
  /** Monatserster */
  monat: IsoDatum;
  mieten: Decimal;
  zins: Decimal;
  tilgung: Decimal;
  schlusszahlung: Decimal;
  investitionen: Decimal;
  ausschuettungen: Decimal;
  sonstigeEinnahmen: Decimal;
  sonstigeAusgaben: Decimal;
  /** Einnahmen − Ausgaben im Monat */
  saldo: Decimal;
  /** Bestand am Monatsende; null, wenn der Anfangsbestand unbekannt ist */
  bestand: Decimal | null;
  /** kumulierte Salden seit Planbeginn */
  kumuliert: Decimal;
  /** null, wenn der Bestand unbekannt ist */
  status: MonatStatus | null;
  kredite: KreditMonat[];
  massnahmen: Array<{ id: string; betrag: Decimal }>;
  positionen: string[];
}

export interface KreditLuecke {
  kreditId: string;
  grund: "saldo" | "zinssatz";
}

export interface Liquiditaetsplan {
  beginn: IsoDatum;
  ende: IsoDatum;
  anfangsbestand: {
    summe: Decimal | null;
    /** jüngster Stand je Konto */
    konten: KontostandDaten[];
    vonStichtag: IsoDatum | null;
    bisStichtag: IsoDatum | null;
  };
  mindestliquiditaet: Decimal | null;
  monate: LiquiditaetMonat[];
  luecken: {
    kredite: KreditLuecke[];
    massnahmeOhneBudget: string[];
    massnahmeOhneEnde: string[];
  };
  hinweise: {
    /** Kredite, deren Zinsbindung im Planzeitraum endet (gerechnet mit bisherigem Satz) */
    zinsbindungEndet: string[];
    /** variable Kredite (Zinssatz von heute fortgeschrieben) */
    variabel: string[];
    /** Maßnahmen mit Ende vor Planbeginn: Restbudget im ersten Monat */
    massnahmeUeberfaellig: string[];
    /** Kredite, deren Zinssicherung im Planzeitraum endet */
    sicherungEndet: string[];
  };
  vollstaendig: boolean;
  summen: {
    einnahmen: Decimal;
    ausgaben: Decimal;
    mieten: Decimal;
    kapitaldienst: Decimal;
    schlusszahlung: Decimal;
    investitionen: Decimal;
    ausschuettungen: Decimal;
    sonstigeEinnahmen: Decimal;
    sonstigeAusgaben: Decimal;
  };
  /** erster Monat mit Bestand unter 0 bzw. unter der Mindestliquidität */
  ersterEngpass: IsoDatum | null;
  ersteUnterschreitung: IsoDatum | null;
  tiefsterBestand: { monat: IsoDatum; bestand: Decimal } | null;
}

const NULL = dezimal(0);

/** Jüngster Kontostand je Konto bis zum Stichtag. */
export function aktuelleKontostaende(staende: KontostandDaten[], stichtag: IsoDatum): KontostandDaten[] {
  const je = new Map<string, KontostandDaten>();
  for (const s of staende) {
    if (s.stichtag > stichtag) continue;
    const vorher = je.get(s.konto);
    if (!vorher || s.stichtag > vorher.stichtag) je.set(s.konto, s);
  }
  return [...je.values()].sort((a, b) => a.konto.localeCompare(b.konto));
}

/** Ist-Nettokaltmiete aller Mietverhältnisse, die am Stichtag laufen. */
export function mietenAm(haeuser: HausDaten[], stichtag: IsoDatum): Decimal {
  let summe = NULL;
  for (const h of haeuser)
    for (const e of h.einheiten)
      for (const m of e.mietverhaeltnisse) if (m.beginn <= stichtag && (m.ende === null || m.ende >= stichtag)) summe = summe.plus(m.istMiete);
  return summe;
}

/** Verteilung des Restbudgets einer Maßnahme auf Monatsnummern (gleichmäßig, Rest im letzten Monat). */
export function verteileRestbudget(
  m: MassnahmePlanDaten,
  planStart: number,
): { verteilung: Map<number, Decimal>; luecke: "budget" | "ende" | null; ueberfaellig: boolean } {
  const verteilung = new Map<number, Decimal>();
  if (m.status === "ABGESCHLOSSEN") return { verteilung, luecke: null, ueberfaellig: false };
  if (m.budget === null) return { verteilung, luecke: "budget", ueberfaellig: false };
  const rest = Decimal.max(m.budget.minus(m.ist), 0);
  if (rest.isZero()) return { verteilung, luecke: null, ueberfaellig: false };
  if (!m.ende) return { verteilung, luecke: "ende", ueberfaellig: false };
  const endeNr = monatsNummer(m.ende);
  if (endeNr < planStart) {
    verteilung.set(planStart, rest);
    return { verteilung, luecke: null, ueberfaellig: true };
  }
  const start = Math.max(planStart, m.beginn ? monatsNummer(m.beginn) : planStart);
  const von = Math.min(start, endeNr);
  const anzahl = endeNr - von + 1;
  const rate = aufCent(rest.dividedBy(anzahl));
  for (let i = 0; i < anzahl; i++) verteilung.set(von + i, i === anzahl - 1 ? rest.minus(rate.times(anzahl - 1)) : rate);
  return { verteilung, luecke: null, ueberfaellig: false };
}

/** Kapitaldienst eines Kredits je Monatsnummer im Planzeitraum. */
export function kapitaldienstPlan(
  k: KreditDaten,
  referenzwerte: ReferenzWert[],
  heute: IsoDatum,
  planStart: number,
  planEnde: number,
): { monate: Map<number, KreditMonat>; luecke: KreditLuecke["grund"] | null } {
  const monate = new Map<number, KreditMonat>();
  const nachweis = restschuldNachweis(k, heute);
  const satz = zinssatz(k, referenzwerte, heute);
  const ref = k.zinsArt === "VARIABEL" && k.referenzzins && k.sicherungen?.length ? referenzzinsAm(referenzwerte, k.referenzzins, heute) : null;
  let saldo: Decimal | null = nachweis ? nachweis.betrag : null;
  const n = PERIODEN_PRO_JAHR[k.zahlweise];
  const anfTilgung = k.anfaenglicheTilgung ? aufCent(k.ursprungsbetrag.times(k.anfaenglicheTilgung).dividedBy(100 * n)) : NULL;
  let rate: Decimal | null = null;
  let luecke: KreditLuecke["grund"] | null = null;
  const laufzeitNr = k.laufzeitBis ? monatsNummer(k.laufzeitBis) : null;
  const auszahlungNr = k.auszahlungsdatum ? monatsNummer(k.auszahlungsdatum) : null;

  for (let m = planStart; m <= planEnde; m++) {
    if (auszahlungNr !== null && m < auszahlungNr) continue;
    // Bei Auszahlung im Planzeitraum fehlt ein Saldo von heute: ab dann ist der Ursprungsbetrag offen.
    if (auszahlungNr !== null && m === auszahlungNr && saldo !== null && saldo.isZero() && nachweis?.herkunft === "nichtAusgezahlt") saldo = k.ursprungsbetrag;
    const plan = gueltigerTilgungsplan(k, monatsende(m));
    const letzte = plan?.zeilen.reduce<IsoDatum | null>((x, z) => (x === null || z.faelligAm > x ? z.faelligAm : x), null) ?? null;
    if (plan && letzte && monatsNummer(letzte) >= m) {
      const zeile = plan.zeilen.find((z) => monatsNummer(z.faelligAm) === m);
      if (zeile) {
        saldo = zeile.restschuld;
        let schluss = NULL;
        if (laufzeitNr === m && saldo.greaterThan(0)) {
          schluss = saldo;
          saldo = NULL;
        }
        monate.set(m, { kreditId: k.id, zins: zeile.zins, tilgung: zeile.tilgung, schluss, quelle: "tilgungsplan" });
      }
      continue;
    }
    if (saldo !== null && saldo.isZero()) continue;
    if ((m + 1) % (12 / n) !== 0 && laufzeitNr !== m) continue;
    if (saldo === null) {
      luecke ??= "saldo";
      continue;
    }
    if (satz === null) {
      luecke ??= "zinssatz";
      continue;
    }
    let zins = NULL;
    let tilgung = NULL;
    if ((m + 1) % (12 / n) === 0) {
      const satzMonat = ref ? (gesicherterSatz(k, ref.satz, monatsende(m), saldo)?.satz ?? satz) : satz;
      zins = aufCent(saldo.times(satzMonat).dividedBy(100 * n));
      if (k.tilgungsart === "ANNUITAET") {
        rate ??= k.ratenbetrag ?? zins.plus(anfTilgung);
        tilgung = rate.minus(zins);
      } else if (k.tilgungsart === "RATENTILGUNG") tilgung = k.ratenbetrag ?? anfTilgung;
      tilgung = Decimal.min(Decimal.max(tilgung, 0), saldo);
      saldo = saldo.minus(tilgung);
    }
    let schluss = NULL;
    if (laufzeitNr === m && saldo.greaterThan(0)) {
      schluss = saldo;
      saldo = NULL;
    }
    monate.set(m, { kreditId: k.id, zins, tilgung, schluss, quelle: "berechnet" });
  }
  return { monate, luecke };
}

export function rechneLiquiditaet(e: LiquiditaetEingabe): Liquiditaetsplan {
  const anzahl = e.monate ?? 12;
  const planStart = monatsNummer(e.heute) + 1;
  const planEnde = planStart + anzahl - 1;

  const konten = aktuelleKontostaende(e.kontostaende, e.heute);
  const anfang = konten.length > 0 ? konten.reduce((s, k) => s.plus(k.betrag), NULL) : null;
  const stichtage = konten.map((k) => k.stichtag).sort();

  const kreditPlaene = e.kredite.map((k) => ({ k, ...kapitaldienstPlan(k, e.referenzwerte, e.heute, planStart, planEnde) }));
  const massnahmen = e.massnahmen.map((m) => ({ m, ...verteileRestbudget(m, planStart) }));

  const monate: LiquiditaetMonat[] = [];
  let kumuliert = NULL;
  for (let nr = planStart; nr <= planEnde; nr++) {
    const kredite = kreditPlaene.map((p) => p.monate.get(nr)).filter((x): x is KreditMonat => !!x);
    const mass = massnahmen.flatMap(({ m, verteilung }) => (verteilung.has(nr) ? [{ id: m.id, betrag: verteilung.get(nr)! }] : []));
    const pos = e.positionen.filter((p) => monatsNummer(p.monat) === nr);
    const summe = (art: PlanpositionArt) => pos.filter((p) => p.art === art).reduce((s, p) => s.plus(p.betrag), NULL);
    const mieten = mietenAm(e.haeuser, monatsanfang(nr));
    const zins = kredite.reduce((s, k) => s.plus(k.zins), NULL);
    const tilgung = kredite.reduce((s, k) => s.plus(k.tilgung), NULL);
    const schlusszahlung = kredite.reduce((s, k) => s.plus(k.schluss), NULL);
    const investitionen = mass.reduce((s, x) => s.plus(x.betrag), NULL);
    const ausschuettungen = summe("AUSSCHUETTUNG");
    const sonstigeEinnahmen = summe("EINNAHME");
    const sonstigeAusgaben = summe("AUSGABE");
    const saldo = mieten.plus(sonstigeEinnahmen).minus(zins).minus(tilgung).minus(schlusszahlung).minus(investitionen).minus(ausschuettungen).minus(sonstigeAusgaben);
    kumuliert = kumuliert.plus(saldo);
    const bestand = anfang === null ? null : anfang.plus(kumuliert);
    const status: MonatStatus | null =
      bestand === null ? null : bestand.lessThan(0) ? "engpass" : e.mindestliquiditaet && bestand.lessThan(e.mindestliquiditaet) ? "unterMindest" : "ok";
    monate.push({
      monat: monatsanfang(nr),
      mieten,
      zins,
      tilgung,
      schlusszahlung,
      investitionen,
      ausschuettungen,
      sonstigeEinnahmen,
      sonstigeAusgaben,
      saldo,
      bestand,
      kumuliert,
      status,
      kredite,
      massnahmen: mass,
      positionen: pos.map((p) => p.id),
    });
  }

  const s = (f: (m: LiquiditaetMonat) => Decimal) => monate.reduce((x, m) => x.plus(f(m)), NULL);
  const luecken = {
    kredite: kreditPlaene.filter((p) => p.luecke).map((p) => ({ kreditId: p.k.id, grund: p.luecke! })),
    massnahmeOhneBudget: massnahmen.filter((x) => x.luecke === "budget").map((x) => x.m.id),
    massnahmeOhneEnde: massnahmen.filter((x) => x.luecke === "ende").map((x) => x.m.id),
  };
  const planEndeDatum = monatsende(planEnde);
  const tiefster = monate.reduce<{ monat: IsoDatum; bestand: Decimal } | null>(
    (t, m) => (m.bestand !== null && (t === null || m.bestand.lessThan(t.bestand)) ? { monat: m.monat, bestand: m.bestand } : t),
    null,
  );
  return {
    beginn: monatsanfang(planStart),
    ende: planEndeDatum,
    anfangsbestand: { summe: anfang, konten, vonStichtag: stichtage[0] ?? null, bisStichtag: stichtage[stichtage.length - 1] ?? null },
    mindestliquiditaet: e.mindestliquiditaet,
    monate,
    luecken,
    hinweise: {
      zinsbindungEndet: e.kredite
        .filter((k) => k.zinsArt === "FEST" && k.zinsbindungBis && k.zinsbindungBis < planEndeDatum && (!k.laufzeitBis || k.laufzeitBis > k.zinsbindungBis))
        .filter((k) => kreditPlaene.find((p) => p.k.id === k.id)!.monate.size > 0)
        .map((k) => k.id),
      variabel: e.kredite.filter((k) => k.zinsArt === "VARIABEL" && kreditPlaene.find((p) => p.k.id === k.id)!.monate.size > 0).map((k) => k.id),
      massnahmeUeberfaellig: massnahmen.filter((x) => x.ueberfaellig).map((x) => x.m.id),
      sicherungEndet: e.kredite
        .filter((k) => k.zinsArt === "VARIABEL" && (k.sicherungen ?? []).some((x) => x.ende >= e.heute && x.ende < planEndeDatum))
        .map((k) => k.id),
    },
    vollstaendig: luecken.kredite.length + luecken.massnahmeOhneBudget.length + luecken.massnahmeOhneEnde.length === 0,
    summen: {
      mieten: s((m) => m.mieten),
      kapitaldienst: s((m) => m.zins.plus(m.tilgung)),
      schlusszahlung: s((m) => m.schlusszahlung),
      investitionen: s((m) => m.investitionen),
      ausschuettungen: s((m) => m.ausschuettungen),
      sonstigeEinnahmen: s((m) => m.sonstigeEinnahmen),
      sonstigeAusgaben: s((m) => m.sonstigeAusgaben),
      einnahmen: s((m) => m.mieten.plus(m.sonstigeEinnahmen)),
      ausgaben: s((m) => m.zins.plus(m.tilgung).plus(m.schlusszahlung).plus(m.investitionen).plus(m.ausschuettungen).plus(m.sonstigeAusgaben)),
    },
    ersterEngpass: monate.find((m) => m.status === "engpass")?.monat ?? null,
    ersteUnterschreitung: monate.find((m) => m.status === "unterMindest" || m.status === "engpass")?.monat ?? null,
    tiefsterBestand: tiefster,
  };
}
