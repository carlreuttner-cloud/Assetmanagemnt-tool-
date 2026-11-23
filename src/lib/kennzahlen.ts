/**
 * Kennzahlen für Häuser, Gesellschaften und das Portfolio. Reine Funktionen.
 *
 * Grundsätze:
 * - Mieten sind Nettokaltmieten pro Monat; Jahreswerte werden mit `jahresNettokaltmiete()` gebildet.
 * - Eine Einheit ist am Stichtag vermietet, wenn ein Mietverhältnis begonnen hat und nicht beendet ist.
 * - Restschuld und Kapitaldienst eines Hauses: Kredite anteilig nach `anteilProzent`.
 * - Gesellschaft und Portfolio: Summe der Häuser plus Summe der eigenen Kredite (zu 100 %).
 * - DSCR vereinfacht: Ist-Jahresnettokaltmiete / Kapitaldienst (ohne Bewirtschaftungskosten).
 */
import { dezimal, type Decimal } from "./geld";
import type { IsoDatum } from "./datum";
import { kapitaldienstJahr, restschuld, type KreditDaten, type ReferenzWert } from "./kredit";
import { jahresNettokaltmiete } from "./miete";

export interface MietverhaeltnisDaten {
  beginn: IsoDatum;
  ende: IsoDatum | null;
  istMiete: Decimal;
  sollMiete: Decimal;
  rueckstand: Decimal;
}

export interface EinheitDaten {
  id: string;
  art: "WOHNUNG" | "GEWERBE";
  flaeche: Decimal;
  erwarteteMiete: Decimal | null;
  mietverhaeltnisse: MietverhaeltnisDaten[];
}

export interface HausDaten {
  id: string;
  gesellschaftId: string;
  kaufpreis: Decimal | null;
  verkehrswerte: { stichtag: IsoDatum; wert: Decimal }[];
  einheiten: EinheitDaten[];
}

export interface Summen {
  haeuser: number;
  einheiten: number;
  leereEinheiten: number;
  flaeche: Decimal;
  leerFlaeche: Decimal;
  verkehrswert: Decimal;
  kaufpreis: Decimal;
  /** Soll-Nettokaltmiete pro Monat der vermieteten Einheiten */
  sollMonat: Decimal;
  /** Ist-Nettokaltmiete pro Monat der vermieteten Einheiten */
  istMonat: Decimal;
  /** Erwartete Nettokaltmiete pro Monat der leeren Einheiten */
  erwartetLeerMonat: Decimal;
  rueckstand: Decimal;
  restschuld: Decimal;
  zinsenJahr: Decimal;
  tilgungJahr: Decimal;
}

export interface Kennzahlen extends Summen {
  vermieteteFlaeche: Decimal;
  sollJahr: Decimal;
  istJahr: Decimal;
  erwartetLeerJahr: Decimal;
  kapitaldienstJahr: Decimal;
  /** Leerstand nach Fläche in Prozent */
  leerstandQuote: Decimal | null;
  /** Restschuld / Verkehrswert in Prozent */
  ltv: Decimal | null;
  /** Ist-Jahresmiete / Kapitaldienst (Faktor) */
  dscr: Decimal | null;
  /** Ist-Jahresmiete / Zinsen (Faktor) */
  icr: Decimal | null;
  /** Soll-Jahresmiete / Kaufpreis in Prozent */
  bruttoanfangsrendite: Decimal | null;
  /** Kaufpreis / Soll-Jahresmiete */
  kaufpreisfaktor: Decimal | null;
  /** Soll-Jahresmiete / Verkehrswert in Prozent */
  mietrendite: Decimal | null;
  /** Soll-Miete pro m² vermietete Fläche und Monat */
  sollProM2: Decimal | null;
}

const NULL = dezimal(0);

export function leereSummen(): Summen {
  return {
    haeuser: 0, einheiten: 0, leereEinheiten: 0, flaeche: NULL, leerFlaeche: NULL, verkehrswert: NULL, kaufpreis: NULL,
    sollMonat: NULL, istMonat: NULL, erwartetLeerMonat: NULL, rueckstand: NULL, restschuld: NULL, zinsenJahr: NULL, tilgungJahr: NULL,
  };
}

export function addiere(a: Summen, b: Summen): Summen {
  return {
    haeuser: a.haeuser + b.haeuser,
    einheiten: a.einheiten + b.einheiten,
    leereEinheiten: a.leereEinheiten + b.leereEinheiten,
    flaeche: a.flaeche.plus(b.flaeche),
    leerFlaeche: a.leerFlaeche.plus(b.leerFlaeche),
    verkehrswert: a.verkehrswert.plus(b.verkehrswert),
    kaufpreis: a.kaufpreis.plus(b.kaufpreis),
    sollMonat: a.sollMonat.plus(b.sollMonat),
    istMonat: a.istMonat.plus(b.istMonat),
    erwartetLeerMonat: a.erwartetLeerMonat.plus(b.erwartetLeerMonat),
    rueckstand: a.rueckstand.plus(b.rueckstand),
    restschuld: a.restschuld.plus(b.restschuld),
    zinsenJahr: a.zinsenJahr.plus(b.zinsenJahr),
    tilgungJahr: a.tilgungJahr.plus(b.tilgungJahr),
  };
}

export function istAktiv(m: Pick<MietverhaeltnisDaten, "beginn" | "ende">, stichtag: IsoDatum): boolean {
  return m.beginn <= stichtag && (m.ende === null || m.ende >= stichtag);
}

/** Aktuellster Verkehrswert bis zum Stichtag (sonst der früheste vorhandene). */
export function verkehrswertAm(h: Pick<HausDaten, "verkehrswerte">, stichtag: IsoDatum): Decimal | null {
  const sortiert = [...h.verkehrswerte].sort((a, b) => (a.stichtag < b.stichtag ? -1 : 1));
  const bis = sortiert.filter((v) => v.stichtag <= stichtag);
  return (bis[bis.length - 1] ?? sortiert[0])?.wert ?? null;
}

/** Werte eines Hauses ohne Kredite (Fläche, Miete, Wert). */
export function hausSummen(h: HausDaten, stichtag: IsoDatum): Summen {
  const s = leereSummen();
  s.haeuser = 1;
  s.verkehrswert = verkehrswertAm(h, stichtag) ?? NULL;
  s.kaufpreis = h.kaufpreis ?? NULL;
  for (const e of h.einheiten) {
    s.einheiten++;
    s.flaeche = s.flaeche.plus(e.flaeche);
    const aktiv = e.mietverhaeltnisse.filter((m) => istAktiv(m, stichtag));
    if (aktiv.length === 0) {
      s.leereEinheiten++;
      s.leerFlaeche = s.leerFlaeche.plus(e.flaeche);
      s.erwartetLeerMonat = s.erwartetLeerMonat.plus(e.erwarteteMiete ?? 0);
    }
    for (const m of aktiv) {
      s.sollMonat = s.sollMonat.plus(m.sollMiete);
      s.istMonat = s.istMonat.plus(m.istMiete);
    }
    // Rückstände auch aus beendeten Mietverhältnissen zählen, solange sie offen sind.
    for (const m of e.mietverhaeltnisse) s.rueckstand = s.rueckstand.plus(m.rueckstand);
  }
  return s;
}

/** Restschuld und Kapitaldienst eines Kredits, optional anteilig (Prozent). */
export function kreditSummen(k: KreditDaten, referenzwerte: ReferenzWert[], stichtag: IsoDatum, anteilProzent: Decimal = dezimal(100)): Summen {
  const s = leereSummen();
  const faktor = anteilProzent.dividedBy(100);
  const kd = kapitaldienstJahr(k, referenzwerte, stichtag);
  s.restschuld = restschuld(k, stichtag).times(faktor);
  s.zinsenJahr = kd.zins.times(faktor);
  s.tilgungJahr = kd.tilgung.times(faktor);
  return s;
}

/** Leitet Quoten und Jahreswerte aus Summen ab. */
export function kennzahlenAus(s: Summen): Kennzahlen {
  const quote = (zaehler: Decimal, nenner: Decimal, mal = 1) =>
    nenner.isZero() ? null : zaehler.times(mal).dividedBy(nenner);
  const sollJahr = jahresNettokaltmiete(s.sollMonat);
  const istJahr = jahresNettokaltmiete(s.istMonat);
  const kapitaldienst = s.zinsenJahr.plus(s.tilgungJahr);
  const vermieteteFlaeche = s.flaeche.minus(s.leerFlaeche);
  return {
    ...s,
    vermieteteFlaeche,
    sollJahr,
    istJahr,
    erwartetLeerJahr: jahresNettokaltmiete(s.erwartetLeerMonat),
    kapitaldienstJahr: kapitaldienst,
    leerstandQuote: quote(s.leerFlaeche, s.flaeche, 100),
    ltv: quote(s.restschuld, s.verkehrswert, 100),
    dscr: quote(istJahr, kapitaldienst),
    icr: quote(istJahr, s.zinsenJahr),
    bruttoanfangsrendite: quote(sollJahr, s.kaufpreis, 100),
    kaufpreisfaktor: quote(s.kaufpreis, sollJahr),
    mietrendite: quote(sollJahr, s.verkehrswert, 100),
    sollProM2: quote(s.sollMonat, vermieteteFlaeche),
  };
}

/** Kennzahlen eines Hauses: eigene Werte plus anteilige Kredite. */
export function hausKennzahlen(h: HausDaten, kredite: KreditDaten[], referenzwerte: ReferenzWert[], stichtag: IsoDatum): Kennzahlen {
  let s = hausSummen(h, stichtag);
  for (const k of kredite) {
    const anteil = k.haeuser.find((x) => x.hausId === h.id)?.anteilProzent;
    if (anteil) s = addiere(s, kreditSummen(k, referenzwerte, stichtag, anteil));
  }
  return kennzahlenAus(s);
}

/** Kennzahlen einer Gruppe (Gesellschaft, Portfolio): Häuser plus Kredite zu 100 %. */
export function gruppenKennzahlen(
  haeuser: HausDaten[],
  kredite: KreditDaten[],
  referenzwerte: ReferenzWert[],
  stichtag: IsoDatum,
): Kennzahlen {
  let s = leereSummen();
  for (const h of haeuser) s = addiere(s, hausSummen(h, stichtag));
  for (const k of kredite) s = addiere(s, kreditSummen(k, referenzwerte, stichtag));
  return kennzahlenAus(s);
}

/**
 * Werte für die Covenant-Prüfung eines Kredits: über alle Häuser, die er belastet,
 * mit allen Krediten dieser Häuser (anteilig). So entspricht der LTV dem Beleihungsauslauf
 * der Sicherheiten.
 */
export function covenantKennzahlen(
  kredit: KreditDaten,
  haeuser: HausDaten[],
  alleKredite: KreditDaten[],
  referenzwerte: ReferenzWert[],
  stichtag: IsoDatum,
): Kennzahlen {
  const ids = new Set(kredit.haeuser.map((x) => x.hausId));
  let s = leereSummen();
  for (const h of haeuser.filter((x) => ids.has(x.id))) {
    s = addiere(s, hausSummen(h, stichtag));
    for (const k of alleKredite) {
      const anteil = k.haeuser.find((x) => x.hausId === h.id)?.anteilProzent;
      if (anteil) s = addiere(s, kreditSummen(k, referenzwerte, stichtag, anteil));
    }
  }
  return kennzahlenAus(s);
}


export interface ZeitreihenPunkt {
  datum: IsoDatum;
  verkehrswert: Decimal;
  restschuld: Decimal;
  /** Soll-Nettokaltmiete pro Monat der an diesem Tag laufenden Mietverhältnisse */
  sollMonat: Decimal;
}

/**
 * Verlauf von Verkehrswert, Restschuld und Soll-Miete zu den angegebenen Stichtagen.
 * Restschuld in der Zukunft folgt dem gültigen Tilgungsplan. Die Miete beruht auf den
 * heutigen Soll-Mieten der jeweils laufenden Mietverhältnisse (frühere Mieterhöhungen
 * werden nicht zurückgerechnet).
 */
export function zeitreihe(haeuser: HausDaten[], kredite: KreditDaten[], stichtage: IsoDatum[]): ZeitreihenPunkt[] {
  return stichtage.map((datum) => {
    let verkehrswert = NULL;
    let sollMonat = NULL;
    for (const h of haeuser) {
      verkehrswert = verkehrswert.plus(verkehrswertAm(h, datum) ?? 0);
      for (const e of h.einheiten) for (const m of e.mietverhaeltnisse) if (istAktiv(m, datum)) sollMonat = sollMonat.plus(m.sollMiete);
    }
    const rest = kredite.reduce((s, k) => s.plus(restschuld(k, datum)), NULL);
    return { datum, verkehrswert, restschuld: rest, sollMonat };
  });
}

/** Restschuld heute nach Jahr des Zinsbindungsendes; variable Kredite unter "variabel". */
export function zinsbindungsProfil(kredite: KreditDaten[], stichtag: IsoDatum): Array<{ jahr: string; restschuld: Decimal; anzahl: number }> {
  const gruppen = new Map<string, { restschuld: Decimal; anzahl: number }>();
  for (const k of kredite) {
    const rest = restschuld(k, stichtag);
    if (rest.lessThanOrEqualTo(0)) continue;
    const jahr = k.zinsArt === "VARIABEL" || !k.zinsbindungBis ? "variabel" : k.zinsbindungBis < stichtag ? stichtag.slice(0, 4) : k.zinsbindungBis.slice(0, 4);
    const g = gruppen.get(jahr) ?? { restschuld: NULL, anzahl: 0 };
    gruppen.set(jahr, { restschuld: g.restschuld.plus(rest), anzahl: g.anzahl + 1 });
  }
  return [...gruppen.entries()]
    .map(([jahr, g]) => ({ jahr, ...g }))
    .sort((a, b) => (a.jahr === "variabel" ? -1 : b.jahr === "variabel" ? 1 : a.jahr.localeCompare(b.jahr)));
}
