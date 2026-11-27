/**
 * Szenarien: Was-wäre-wenn-Vorschau über mehrere Jahre (reine Funktionen).
 *
 * Gerechnet wird Monat für Monat ab heute, ausgewiesen werden ganze Kalenderjahre ab dem
 * nächsten Jahr. Annahmen (im PR und in der Oberfläche beschrieben):
 * - Mieten: heutige Soll-Miete der laufenden Mietverhältnisse, Steigerung jeweils zum 1. Januar.
 *   Einnahmen = Soll-Miete × heutige Ist-Quote des Hauses (Ist/Soll) × (1 − Mietausfall).
 * - Leerstand: bleibt leer oder wird nach N Monaten zur erwarteten Miete vermietet.
 * - Kredite: Ausgang ist die heutige Restschuld. Zinssatz fest bis Zinsbindungsende, danach der
 *   Anschlusszins (ohne Angabe unverändert). Variable Kredite: heutiger Satz plus Zinsänderung.
 *   Ändert sich der Zins, bleibt der Tilgungsbetrag je Rate gleich, die Rate passt sich an.
 *   Endfällige Kredite werden bei Laufzeitende als verlängert angenommen.
 * - Verkauf: ab dem Verkaufsmonat keine Miete und kein Wert mehr; der Anteil des Hauses an jedem
 *   Kredit wird aus dem Erlös abgelöst (optional mit Vorfälligkeitsentschädigung), Raten sinken
 *   im selben Verhältnis.
 * - Wertentwicklung: Verkehrswert heute × (1 + Satz) je Jahr.
 */
import { aufCent, dezimal, Decimal } from "./geld";
import { monatsNummer, type IsoDatum } from "./datum";
import { hausSummen, verkehrswertAm, type HausDaten } from "./kennzahlen";
import { PERIODEN_PRO_JAHR, restschuld, restschuldNachweis, zinssatz, type KreditDaten, type ReferenzWert } from "./kredit";

export interface Verkauf {
  hausId: string;
  datum: IsoDatum;
  /** Verkaufspreis; ohne Angabe der fortgeschriebene Verkehrswert */
  preis: Decimal | null;
}

export interface SzenarioParameter {
  /** Anzahl der ausgewiesenen Jahre (1 bis 10) */
  jahre: number;
  /** Änderung der variablen Zinsen in Prozentpunkten */
  zinsVariabelPP: Decimal;
  /** Zinssatz für Festzinskredite nach Ende der Zinsbindung (Prozent p. a.), null = unverändert */
  anschlusszins: Decimal | null;
  /** Mietsteigerung in Prozent pro Jahr */
  mietsteigerung: Decimal;
  /** Zusätzlicher Mietausfall in Prozent der Soll-Miete */
  mietausfall: Decimal;
  /** Leere Einheiten werden nach so vielen Monaten zur erwarteten Miete vermietet; null = bleiben leer */
  leerVermietenMonate: number | null;
  /** Wertentwicklung in Prozent pro Jahr */
  wertentwicklung: Decimal;
  verkaeufe: Verkauf[];
  /** Verkaufskosten in Prozent des Preises */
  verkaufskosten: Decimal;
  /** Vorfälligkeitsentschädigung in Prozent der abgelösten Restschuld */
  vorfaelligkeit: Decimal;
}

export function basisParameter(jahre = 5): SzenarioParameter {
  const n = dezimal(0);
  return {
    jahre,
    zinsVariabelPP: n,
    anschlusszins: null,
    mietsteigerung: n,
    mietausfall: n,
    leerVermietenMonate: null,
    wertentwicklung: n,
    verkaeufe: [],
    verkaufskosten: n,
    vorfaelligkeit: n,
  };
}

export interface SzenarioJahr {
  jahr: number;
  sollMiete: Decimal;
  einnahmen: Decimal;
  zinsen: Decimal;
  tilgung: Decimal;
  kapitaldienst: Decimal;
  /** Einnahmen − Kapitaldienst (ohne Bewirtschaftungskosten und Steuern) */
  cashflow: Decimal;
  /** Verkaufspreis − Kosten − Ablöse − Vorfälligkeit */
  verkaufNetto: Decimal;
  restschuld: Decimal;
  verkehrswert: Decimal;
  ltv: Decimal | null;
  dscr: Decimal | null;
  haeuser: number;
}

/**
 * Datenlücken des Startbestands. Betroffene Kredite rechnen nicht mit (kein Schätzwert), betroffene
 * Häuser gehen ohne Wert ein; LTV wird dann nicht ausgewiesen. `saldoVon`/`saldoBis`: Spanne der
 * Stichtage der belegten Start-Restschulden.
 */
export interface SzenarioLuecken {
  kreditOhneSaldo: string[];
  kreditOhneZinssatz: string[];
  hausOhneWert: string[];
  saldoVon: IsoDatum | null;
  saldoBis: IsoDatum | null;
}

export interface SzenarioErgebnis {
  heute: { restschuld: Decimal; verkehrswert: Decimal; sollMieteJahr: Decimal; ltv: Decimal | null };
  luecken: SzenarioLuecken;
  jahre: SzenarioJahr[];
  summe: { einnahmen: Decimal; zinsen: Decimal; tilgung: Decimal; cashflow: Decimal; verkaufNetto: Decimal };
}

const NULL = dezimal(0);
const hoch = (basis: Decimal, prozent: Decimal, jahre: number) => basis.times(dezimal(1).plus(prozent.dividedBy(100)).pow(jahre));

interface KreditZustand {
  k: KreditDaten;
  saldo: Decimal;
  satz: Decimal;
  /** Annuität: Rate je Zahlung */
  rate: Decimal;
  /** Ratentilgung: Tilgung je Zahlung */
  tilgungFix: Decimal;
  n: number;
  /** Monatsnummer des Zinsbindungsendes (Festzins), ab dem Folgemonat gilt der Anschlusszins */
  bindungBis: number | null;
  /** Summe der Hausanteile, die noch nicht verkauft sind */
  restAnteil: Decimal;
}

function startZustand(
  k: KreditDaten,
  referenzwerte: ReferenzWert[],
  stichtag: IsoDatum,
  p: SzenarioParameter,
  luecken: SzenarioLuecken,
): KreditZustand | null {
  const n = PERIODEN_PRO_JAHR[k.zahlweise];
  const nachweis = restschuldNachweis(k, stichtag);
  const heuteSatz = zinssatz(k, referenzwerte, stichtag);
  if (!nachweis) luecken.kreditOhneSaldo.push(k.id);
  else if (heuteSatz === null && nachweis.betrag.greaterThan(0)) luecken.kreditOhneZinssatz.push(k.id);
  if (!nachweis || heuteSatz === null) return null;
  if (nachweis.herkunft !== "nichtAusgezahlt") {
    if (!luecken.saldoVon || nachweis.stichtag < luecken.saldoVon) luecken.saldoVon = nachweis.stichtag;
    if (!luecken.saldoBis || nachweis.stichtag > luecken.saldoBis) luecken.saldoBis = nachweis.stichtag;
  }
  const saldo = nachweis.betrag;
  const anfTilgung = k.anfaenglicheTilgung ? aufCent(k.ursprungsbetrag.times(k.anfaenglicheTilgung).dividedBy(100 * n)) : NULL;
  const zinsHeute = aufCent(saldo.times(heuteSatz).dividedBy(100 * n));
  let rate = NULL;
  let tilgungFix = NULL;
  if (k.tilgungsart === "ANNUITAET") rate = k.ratenbetrag ?? zinsHeute.plus(anfTilgung);
  if (k.tilgungsart === "RATENTILGUNG") tilgungFix = k.ratenbetrag ?? anfTilgung;
  const z: KreditZustand = {
    k,
    saldo,
    satz: heuteSatz,
    rate,
    tilgungFix,
    n,
    bindungBis: k.zinsArt === "FEST" && k.zinsbindungBis ? monatsNummer(k.zinsbindungBis) : null,
    restAnteil: k.haeuser.reduce((s, h) => s.plus(h.anteilProzent), NULL),
  };
  if (k.zinsArt === "VARIABEL") neuerSatz(z, heuteSatz.plus(p.zinsVariabelPP));
  if (z.bindungBis !== null && z.bindungBis < monatsNummer(stichtag) && p.anschlusszins) neuerSatz(z, p.anschlusszins);
  return z;
}

/** Zinsänderung: bei Annuitäten bleibt der Tilgungsbetrag je Rate gleich. */
function neuerSatz(z: KreditZustand, satz: Decimal) {
  const s = Decimal.max(satz, 0);
  if (z.k.tilgungsart === "ANNUITAET") {
    const tilgung = Decimal.max(z.rate.minus(aufCent(z.saldo.times(z.satz).dividedBy(100 * z.n))), 0);
    z.rate = aufCent(z.saldo.times(s).dividedBy(100 * z.n)).plus(tilgung);
  }
  z.satz = s;
}

export function rechneSzenario(
  haeuser: HausDaten[],
  kredite: KreditDaten[],
  referenzwerte: ReferenzWert[],
  stichtag: IsoDatum,
  p: SzenarioParameter,
): SzenarioErgebnis {
  const startMonat = monatsNummer(stichtag);
  const startJahr = Number(stichtag.slice(0, 4));
  const letzterMonat = (startJahr + p.jahre) * 12 + 11;

  const haus = haeuser.map((h) => {
    const s = hausSummen(h, stichtag);
    const verkauf = p.verkaeufe.find((v) => v.hausId === h.id && v.datum >= stichtag) ?? null;
    return {
      h,
      soll: s.sollMonat,
      leer: s.erwartetLeerMonat,
      quote: s.sollMonat.isZero() ? dezimal(1) : s.istMonat.dividedBy(s.sollMonat),
      wert: verkehrswertAm(h, stichtag),
      verkaufMonat: verkauf ? monatsNummer(verkauf.datum) : Infinity,
      verkauf,
    };
  });
  const luecken: SzenarioLuecken = { kreditOhneSaldo: [], kreditOhneZinssatz: [], hausOhneWert: haus.filter((x) => x.wert === null).map((x) => x.h.id), saldoVon: null, saldoBis: null };
  const zustaende = kredite
    .map((k) => startZustand(k, referenzwerte, stichtag, p, luecken))
    .filter((z): z is KreditZustand => z !== null && z.saldo.greaterThan(0));
  const vollstaendig = luecken.kreditOhneSaldo.length + luecken.kreditOhneZinssatz.length + luecken.hausOhneWert.length === 0;
  const ausfall = dezimal(1).minus(p.mietausfall.dividedBy(100));

  const jahre = new Map<number, SzenarioJahr>();
  const jahr = (j: number) => {
    if (!jahre.has(j)) {
      jahre.set(j, {
        jahr: j, sollMiete: NULL, einnahmen: NULL, zinsen: NULL, tilgung: NULL, kapitaldienst: NULL, cashflow: NULL,
        verkaufNetto: NULL, restschuld: NULL, verkehrswert: NULL, ltv: null, dscr: null, haeuser: 0,
      });
    }
    return jahre.get(j)!;
  };

  for (let m = startMonat; m <= letzterMonat; m++) {
    const j = Math.floor(m / 12);
    const zeile = j > startJahr ? jahr(j) : null;

    // Verkäufe zu Monatsbeginn
    for (const x of haus.filter((x) => x.verkaufMonat === m)) {
      // Ohne Preis und ohne Verkehrswert kein geschätzter Erlös (Lücke); die Kredite werden trotzdem abgelöst.
      const preis = x.verkauf!.preis ?? (x.wert ? hoch(x.wert, p.wertentwicklung, (m - startMonat) / 12) : NULL);
      let netto = preis.minus(preis.times(p.verkaufskosten).dividedBy(100));
      for (const z of zustaende) {
        const anteil = z.k.haeuser.find((a) => a.hausId === x.h.id)?.anteilProzent;
        if (!anteil || z.restAnteil.isZero() || z.saldo.isZero()) continue;
        const abloese = aufCent(z.saldo.times(anteil).dividedBy(z.restAnteil));
        const faktor = z.saldo.minus(abloese).dividedBy(z.saldo);
        netto = netto.minus(abloese).minus(abloese.times(p.vorfaelligkeit).dividedBy(100));
        z.saldo = z.saldo.minus(abloese);
        z.rate = aufCent(z.rate.times(faktor));
        z.tilgungFix = aufCent(z.tilgungFix.times(faktor));
        z.restAnteil = z.restAnteil.minus(anteil);
      }
      if (zeile) zeile.verkaufNetto = zeile.verkaufNetto.plus(aufCent(netto));
    }

    // Mieten
    if (zeile) {
      const steigerung = j - startJahr;
      for (const x of haus) {
        if (m >= x.verkaufMonat) continue;
        const vermietet = p.leerVermietenMonate !== null && m >= startMonat + p.leerVermietenMonate;
        const soll = hoch(x.soll.plus(vermietet ? x.leer : 0), p.mietsteigerung, steigerung);
        zeile.sollMiete = zeile.sollMiete.plus(soll);
        zeile.einnahmen = zeile.einnahmen.plus(soll.times(x.quote).times(ausfall));
      }
    }

    // Kredite: Zinsbindungsende, dann Zahlung am Monatsende
    for (const z of zustaende) {
      if (z.bindungBis !== null && m === z.bindungBis + 1 && p.anschlusszins) neuerSatz(z, p.anschlusszins);
      if ((m + 1) % (12 / z.n) !== 0 || z.saldo.isZero()) continue;
      const zins = aufCent(z.saldo.times(z.satz).dividedBy(100 * z.n));
      let tilgung = z.k.tilgungsart === "ANNUITAET" ? z.rate.minus(zins) : z.k.tilgungsart === "RATENTILGUNG" ? z.tilgungFix : NULL;
      tilgung = Decimal.min(Decimal.max(tilgung, 0), z.saldo);
      z.saldo = z.saldo.minus(tilgung);
      if (zeile) {
        zeile.zinsen = zeile.zinsen.plus(zins);
        zeile.tilgung = zeile.tilgung.plus(tilgung);
      }
    }

    // Jahresende: Bestände
    if (zeile && m % 12 === 11) {
      zeile.restschuld = zustaende.reduce((s, z) => s.plus(z.saldo), NULL);
      const imBestand = haus.filter((x) => m < x.verkaufMonat);
      zeile.haeuser = imBestand.length;
      zeile.verkehrswert = imBestand.reduce((s, x) => s.plus(x.wert ? hoch(x.wert, p.wertentwicklung, j - startJahr) : 0), NULL);
    }
  }

  const liste = [...jahre.values()].sort((a, b) => a.jahr - b.jahr);
  for (const z of liste) {
    z.sollMiete = aufCent(z.sollMiete);
    z.einnahmen = aufCent(z.einnahmen);
    z.verkehrswert = aufCent(z.verkehrswert);
    z.kapitaldienst = z.zinsen.plus(z.tilgung);
    z.cashflow = z.einnahmen.minus(z.kapitaldienst);
    z.ltv = z.verkehrswert.isZero() || !vollstaendig ? null : z.restschuld.dividedBy(z.verkehrswert).times(100);
    z.dscr = z.kapitaldienst.isZero() ? null : z.einnahmen.dividedBy(z.kapitaldienst);
  }

  const restHeute = zustaende.reduce((s, z) => s.plus(restschuld(z.k, stichtag) ?? 0), NULL);
  const wertHeute = haus.reduce((s, x) => s.plus(x.wert ?? 0), NULL);
  const summe = (f: (z: SzenarioJahr) => Decimal) => liste.reduce((s, z) => s.plus(f(z)), NULL);
  return {
    heute: {
      restschuld: restHeute,
      verkehrswert: wertHeute,
      sollMieteJahr: haus.reduce((s, x) => s.plus(x.soll), NULL).times(12),
      ltv: wertHeute.isZero() || !vollstaendig ? null : restHeute.dividedBy(wertHeute).times(100),
    },
    luecken,
    jahre: liste,
    summe: {
      einnahmen: summe((z) => z.einnahmen),
      zinsen: summe((z) => z.zinsen),
      tilgung: summe((z) => z.tilgung),
      cashflow: summe((z) => z.cashflow),
      verkaufNetto: summe((z) => z.verkaufNetto),
    },
  };
}

// ---------------------------------------------------------------------------
// Speichern und Einlesen der Parameter (JSON mit Beträgen als Text)

export type ParameterJson = {
  jahre: number;
  zinsVariabelPP: string;
  anschlusszins: string | null;
  mietsteigerung: string;
  mietausfall: string;
  leerVermietenMonate: number | null;
  wertentwicklung: string;
  verkaeufe: { hausId: string; datum: string; preis: string | null }[];
  verkaufskosten: string;
  vorfaelligkeit: string;
};

export function alsJson(p: SzenarioParameter): ParameterJson {
  return {
    jahre: p.jahre,
    zinsVariabelPP: p.zinsVariabelPP.toString(),
    anschlusszins: p.anschlusszins?.toString() ?? null,
    mietsteigerung: p.mietsteigerung.toString(),
    mietausfall: p.mietausfall.toString(),
    leerVermietenMonate: p.leerVermietenMonate,
    wertentwicklung: p.wertentwicklung.toString(),
    verkaeufe: p.verkaeufe.map((v) => ({ hausId: v.hausId, datum: v.datum, preis: v.preis?.toString() ?? null })),
    verkaufskosten: p.verkaufskosten.toString(),
    vorfaelligkeit: p.vorfaelligkeit.toString(),
  };
}

export function ausJson(j: unknown): SzenarioParameter {
  const b = basisParameter();
  if (!j || typeof j !== "object") return b;
  const o = j as Partial<ParameterJson>;
  const d = (w: unknown, standard: Decimal) => {
    try {
      return typeof w === "string" || typeof w === "number" ? dezimal(w) : standard;
    } catch {
      return standard;
    }
  };
  return {
    jahre: typeof o.jahre === "number" ? Math.min(10, Math.max(1, Math.round(o.jahre))) : b.jahre,
    zinsVariabelPP: d(o.zinsVariabelPP, b.zinsVariabelPP),
    anschlusszins: o.anschlusszins == null ? null : d(o.anschlusszins, NULL),
    mietsteigerung: d(o.mietsteigerung, b.mietsteigerung),
    mietausfall: d(o.mietausfall, b.mietausfall),
    leerVermietenMonate: typeof o.leerVermietenMonate === "number" ? Math.max(0, Math.round(o.leerVermietenMonate)) : null,
    wertentwicklung: d(o.wertentwicklung, b.wertentwicklung),
    verkaeufe: Array.isArray(o.verkaeufe)
      ? o.verkaeufe
          .filter((v) => v && typeof v.hausId === "string" && typeof v.datum === "string")
          .map((v) => ({ hausId: v.hausId, datum: v.datum, preis: v.preis == null ? null : d(v.preis, NULL) }))
      : [],
    verkaufskosten: d(o.verkaufskosten, b.verkaufskosten),
    vorfaelligkeit: d(o.vorfaelligkeit, b.vorfaelligkeit),
  };
}
