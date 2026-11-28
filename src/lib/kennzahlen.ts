/**
 * Kennzahlen für Häuser, Gesellschaften und das Portfolio. Reine Funktionen.
 *
 * Grundsätze:
 * - Mieten sind Nettokaltmieten pro Monat; Jahreswerte werden mit `jahresNettokaltmiete()` gebildet.
 * - Eine Einheit ist am Stichtag vermietet, wenn ein Mietverhältnis begonnen hat und nicht beendet ist.
 * - Restschuld und Kapitaldienst eines Hauses: Kredite anteilig nach `anteilProzent`.
 * - Gesellschaft und Portfolio: Summe der Häuser plus Summe der eigenen Kredite (zu 100 %).
 * - Nutzungsarten: `nachArt` hält Anzahl, Fläche, Leerstand und Mieten je Wohnen, Gewerbe und
 *   Stellplätze. Fläche und Leerstandsquote umfassen nur Wohnen und Gewerbe (m²); Stellplätze
 *   zählen in Stück. Mieten und Einheitenzahlen umfassen alle Nutzungsarten.
 * - DSCR vereinfacht: Ist-Jahresnettokaltmiete / Kapitaldienst (ohne Bewirtschaftungskosten).
 * - Fehlende Werte (Verkehrswert, Kaufpreis, belegte Restschuld, Kapitaldienst, erwartete Miete)
 *   werden nie als 0 gezählt: `luecken` hält je Größe fest, wie viele Teile bekannt sind und
 *   fehlen und von welchen Stichtagen die bekannten stammen. Quoten mit unvollständigen
 *   Grundlagen sind null (unbekannt); Summen mit Lücken werden als unvollständig angezeigt.
 */
import { dezimal, type Decimal } from "./geld";
import type { IsoDatum } from "./datum";
import { kapitaldienstJahr, restschuld, restschuldNachweis, type KreditDaten, type ReferenzWert } from "./kredit";
import { jahresNettokaltmiete } from "./miete";
import { inFlaeche, NUTZUNGSARTEN, type Nutzungsart } from "./nutzungsart";

export interface MietverhaeltnisDaten {
  beginn: IsoDatum;
  ende: IsoDatum | null;
  istMiete: Decimal;
  sollMiete: Decimal;
  rueckstand: Decimal;
}

export interface EinheitDaten {
  id: string;
  art: Nutzungsart;
  /** Fläche in m²; bei Stellplätzen nur informativ (nicht in Flächensummen) */
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

/** Wie vollständig eine Summe ist: Anzahl bekannter und fehlender Teile, Spanne der Stichtage. */
export interface Vollstaendigkeit {
  bekannt: number;
  fehlend: number;
  von: IsoDatum | null;
  bis: IsoDatum | null;
  /** Anzahl der Teile, die hochgerechnet statt belegt sind (Kapitaldienst) */
  geschaetzt: number;
}

export type LueckenArt = "verkehrswert" | "kaufpreis" | "restschuld" | "kapitaldienst" | "erwarteteMiete";
export type Luecken = Record<LueckenArt, Vollstaendigkeit>;

const leer = (): Vollstaendigkeit => ({ bekannt: 0, fehlend: 0, von: null, bis: null, geschaetzt: 0 });

function verbinde(a: Vollstaendigkeit, b: Vollstaendigkeit): Vollstaendigkeit {
  const min = (x: IsoDatum | null, y: IsoDatum | null) => (x === null ? y : y === null ? x : x < y ? x : y);
  const max = (x: IsoDatum | null, y: IsoDatum | null) => (x === null ? y : y === null ? x : x > y ? x : y);
  return { bekannt: a.bekannt + b.bekannt, fehlend: a.fehlend + b.fehlend, von: min(a.von, b.von), bis: max(a.bis, b.bis), geschaetzt: a.geschaetzt + b.geschaetzt };
}

function teil(bekannt: boolean, stichtag: IsoDatum | null = null, geschaetzt = false): Vollstaendigkeit {
  return { bekannt: bekannt ? 1 : 0, fehlend: bekannt ? 0 : 1, von: stichtag, bis: stichtag, geschaetzt: geschaetzt ? 1 : 0 };
}

/** true, wenn keine Teile fehlen. */
export const vollstaendig = (v: Vollstaendigkeit) => v.fehlend === 0;

/** Summe für die Anzeige: null (unbekannt), wenn kein Teil bekannt ist, aber welche fehlen. */
export const summeOderUnbekannt = (wert: Decimal, v: Vollstaendigkeit): Decimal | null => (v.bekannt === 0 && v.fehlend > 0 ? null : wert);

/** Werte einer Nutzungsart. Fläche nur für Wohnen und Gewerbe (bei Stellplätzen 0, sie zählen in Stück). */
export interface ArtSummen {
  einheiten: number;
  leereEinheiten: number;
  flaeche: Decimal;
  leerFlaeche: Decimal;
  sollMonat: Decimal;
  istMonat: Decimal;
  erwartetLeerMonat: Decimal;
}

export interface Summen {
  haeuser: number;
  /** alle Einheiten (Wohnen, Gewerbe, Stellplätze) */
  einheiten: number;
  leereEinheiten: number;
  /** Wohn- und Gewerbefläche in m² (ohne Stellplätze) */
  flaeche: Decimal;
  /** leere Wohn- und Gewerbefläche in m² */
  leerFlaeche: Decimal;
  /** Aufteilung nach Nutzungsart */
  nachArt: Record<Nutzungsart, ArtSummen>;
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
  luecken: Luecken;
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
  /** Soll-Miete (Wohnen und Gewerbe) pro m² vermietete Fläche und Monat; ohne Stellplatzmieten */
  sollProM2: Decimal | null;
  /** Leerstand je Nutzungsart in Prozent: Wohnen/Gewerbe nach Fläche, Stellplätze nach Stück */
  leerstandQuoteNachArt: Record<Nutzungsart, Decimal | null>;
}

const NULL = dezimal(0);

const leereArt = (): ArtSummen => ({ einheiten: 0, leereEinheiten: 0, flaeche: NULL, leerFlaeche: NULL, sollMonat: NULL, istMonat: NULL, erwartetLeerMonat: NULL });
const leereArten = () => Object.fromEntries(NUTZUNGSARTEN.map((a) => [a, leereArt()])) as Record<Nutzungsart, ArtSummen>;

function addiereArt(a: ArtSummen, b: ArtSummen): ArtSummen {
  return {
    einheiten: a.einheiten + b.einheiten,
    leereEinheiten: a.leereEinheiten + b.leereEinheiten,
    flaeche: a.flaeche.plus(b.flaeche),
    leerFlaeche: a.leerFlaeche.plus(b.leerFlaeche),
    sollMonat: a.sollMonat.plus(b.sollMonat),
    istMonat: a.istMonat.plus(b.istMonat),
    erwartetLeerMonat: a.erwartetLeerMonat.plus(b.erwartetLeerMonat),
  };
}

export function leereSummen(): Summen {
  return {
    haeuser: 0, einheiten: 0, leereEinheiten: 0, flaeche: NULL, leerFlaeche: NULL, nachArt: leereArten(), verkehrswert: NULL, kaufpreis: NULL,
    sollMonat: NULL, istMonat: NULL, erwartetLeerMonat: NULL, rueckstand: NULL, restschuld: NULL, zinsenJahr: NULL, tilgungJahr: NULL,
    luecken: { verkehrswert: leer(), kaufpreis: leer(), restschuld: leer(), kapitaldienst: leer(), erwarteteMiete: leer() },
  };
}

export function addiere(a: Summen, b: Summen): Summen {
  return {
    haeuser: a.haeuser + b.haeuser,
    einheiten: a.einheiten + b.einheiten,
    leereEinheiten: a.leereEinheiten + b.leereEinheiten,
    flaeche: a.flaeche.plus(b.flaeche),
    leerFlaeche: a.leerFlaeche.plus(b.leerFlaeche),
    nachArt: Object.fromEntries(NUTZUNGSARTEN.map((x) => [x, addiereArt(a.nachArt[x], b.nachArt[x])])) as Record<Nutzungsart, ArtSummen>,
    verkehrswert: a.verkehrswert.plus(b.verkehrswert),
    kaufpreis: a.kaufpreis.plus(b.kaufpreis),
    sollMonat: a.sollMonat.plus(b.sollMonat),
    istMonat: a.istMonat.plus(b.istMonat),
    erwartetLeerMonat: a.erwartetLeerMonat.plus(b.erwartetLeerMonat),
    rueckstand: a.rueckstand.plus(b.rueckstand),
    restschuld: a.restschuld.plus(b.restschuld),
    zinsenJahr: a.zinsenJahr.plus(b.zinsenJahr),
    tilgungJahr: a.tilgungJahr.plus(b.tilgungJahr),
    luecken: {
      verkehrswert: verbinde(a.luecken.verkehrswert, b.luecken.verkehrswert),
      kaufpreis: verbinde(a.luecken.kaufpreis, b.luecken.kaufpreis),
      restschuld: verbinde(a.luecken.restschuld, b.luecken.restschuld),
      kapitaldienst: verbinde(a.luecken.kapitaldienst, b.luecken.kapitaldienst),
      erwarteteMiete: verbinde(a.luecken.erwarteteMiete, b.luecken.erwarteteMiete),
    },
  };
}

export function istAktiv(m: Pick<MietverhaeltnisDaten, "beginn" | "ende">, stichtag: IsoDatum): boolean {
  return m.beginn <= stichtag && (m.ende === null || m.ende >= stichtag);
}

/** Aktuellster Verkehrswert bis zum Stichtag mit seinem Stichtag; null, wenn es keinen gibt. */
export function verkehrswertEintragAm(h: Pick<HausDaten, "verkehrswerte">, stichtag: IsoDatum): { stichtag: IsoDatum; wert: Decimal } | null {
  let best: { stichtag: IsoDatum; wert: Decimal } | null = null;
  for (const v of h.verkehrswerte) if (v.stichtag <= stichtag && (!best || v.stichtag > best.stichtag)) best = v;
  return best;
}

/** Aktuellster Verkehrswert bis zum Stichtag; null (unbekannt), wenn es bis dahin keinen gibt. */
export function verkehrswertAm(h: Pick<HausDaten, "verkehrswerte">, stichtag: IsoDatum): Decimal | null {
  return verkehrswertEintragAm(h, stichtag)?.wert ?? null;
}

/** Werte eines Hauses ohne Kredite (Fläche, Miete, Wert). */
export function hausSummen(h: HausDaten, stichtag: IsoDatum): Summen {
  const s = leereSummen();
  s.haeuser = 1;
  const vw = verkehrswertEintragAm(h, stichtag);
  s.verkehrswert = vw?.wert ?? NULL;
  s.luecken.verkehrswert = teil(vw !== null, vw?.stichtag ?? null);
  s.kaufpreis = h.kaufpreis ?? NULL;
  s.luecken.kaufpreis = teil(h.kaufpreis !== null);
  for (const e of h.einheiten) {
    const art = s.nachArt[e.art];
    const flaeche = inFlaeche(e.art) ? e.flaeche : NULL;
    s.einheiten++;
    art.einheiten++;
    s.flaeche = s.flaeche.plus(flaeche);
    art.flaeche = art.flaeche.plus(flaeche);
    const aktiv = e.mietverhaeltnisse.filter((m) => istAktiv(m, stichtag));
    if (aktiv.length === 0) {
      s.leereEinheiten++;
      art.leereEinheiten++;
      s.leerFlaeche = s.leerFlaeche.plus(flaeche);
      art.leerFlaeche = art.leerFlaeche.plus(flaeche);
      s.erwartetLeerMonat = s.erwartetLeerMonat.plus(e.erwarteteMiete ?? 0);
      art.erwartetLeerMonat = art.erwartetLeerMonat.plus(e.erwarteteMiete ?? 0);
      s.luecken.erwarteteMiete = verbinde(s.luecken.erwarteteMiete, teil(e.erwarteteMiete !== null));
    }
    for (const m of aktiv) {
      s.sollMonat = s.sollMonat.plus(m.sollMiete);
      s.istMonat = s.istMonat.plus(m.istMiete);
      art.sollMonat = art.sollMonat.plus(m.sollMiete);
      art.istMonat = art.istMonat.plus(m.istMiete);
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
  const rest = restschuldNachweis(k, stichtag);
  s.restschuld = rest ? rest.betrag.times(faktor) : NULL;
  s.luecken.restschuld = teil(rest !== null, rest?.stichtag ?? null);
  s.zinsenJahr = kd ? kd.zins.times(faktor) : NULL;
  s.tilgungJahr = kd ? kd.tilgung.times(faktor) : NULL;
  s.luecken.kapitaldienst = teil(kd !== null, null, kd?.quelle === "schaetzung");
  return s;
}

/** Leitet Quoten und Jahreswerte aus Summen ab. */
export function kennzahlenAus(s: Summen): Kennzahlen {
  const quote = (zaehler: Decimal, nenner: Decimal, mal = 1, ...grundlagen: LueckenArt[]) =>
    nenner.isZero() || grundlagen.some((g) => !vollstaendig(s.luecken[g])) ? null : zaehler.times(mal).dividedBy(nenner);
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
    ltv: quote(s.restschuld, s.verkehrswert, 100, "restschuld", "verkehrswert"),
    dscr: quote(istJahr, kapitaldienst, 1, "kapitaldienst"),
    icr: quote(istJahr, s.zinsenJahr, 1, "kapitaldienst"),
    bruttoanfangsrendite: quote(sollJahr, s.kaufpreis, 100, "kaufpreis"),
    kaufpreisfaktor: quote(s.kaufpreis, sollJahr, 1, "kaufpreis"),
    mietrendite: quote(sollJahr, s.verkehrswert, 100, "verkehrswert"),
    sollProM2: quote(s.nachArt.WOHNUNG.sollMonat.plus(s.nachArt.GEWERBE.sollMonat), vermieteteFlaeche),
    leerstandQuoteNachArt: Object.fromEntries(NUTZUNGSARTEN.map((a) => [a, leerstandQuoteArt(a, s.nachArt[a])])) as Record<Nutzungsart, Decimal | null>,
  };
}

/** Leerstand einer Nutzungsart in Prozent: nach Fläche (Wohnen, Gewerbe) bzw. nach Stück (Stellplätze). */
export function leerstandQuoteArt(art: Nutzungsart, a: ArtSummen): Decimal | null {
  if (inFlaeche(art)) return a.flaeche.isZero() ? null : a.leerFlaeche.times(100).dividedBy(a.flaeche);
  return a.einheiten === 0 ? null : dezimal(a.leereEinheiten).times(100).dividedBy(a.einheiten);
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
  /** null, wenn für mindestens ein Haus kein Verkehrswert bis zu diesem Tag vorliegt */
  verkehrswert: Decimal | null;
  /** belegte Restschuld; null, wenn für mindestens einen ausgezahlten Kredit kein Beleg vorliegt */
  restschuld: Decimal | null;
  /** Soll-Nettokaltmiete pro Monat der an diesem Tag laufenden Mietverhältnisse */
  sollMonat: Decimal;
}

/**
 * Verlauf von Verkehrswert, belegter Restschuld und Soll-Miete zu den angegebenen Stichtagen.
 * Restschuld nur aus Belegen (jüngster Beleg bis zum Tag); Planwerte stehen je Kredit im
 * Saldenvergleich (`saldenJahresvergleich`). Fehlt ein Wert, ist der Punkt unbekannt (keine Lücke als 0). Die Miete beruht auf den
 * heutigen Soll-Mieten der jeweils laufenden Mietverhältnisse (frühere Mieterhöhungen
 * werden nicht zurückgerechnet).
 */
export function zeitreihe(haeuser: HausDaten[], kredite: KreditDaten[], stichtage: IsoDatum[]): ZeitreihenPunkt[] {
  return stichtage.map((datum) => {
    let verkehrswert: Decimal | null = NULL;
    let sollMonat = NULL;
    for (const h of haeuser) {
      const vw = verkehrswertAm(h, datum);
      verkehrswert = vw === null || verkehrswert === null ? null : verkehrswert.plus(vw);
      for (const e of h.einheiten) for (const m of e.mietverhaeltnisse) if (istAktiv(m, datum)) sollMonat = sollMonat.plus(m.sollMiete);
    }
    let rest: Decimal | null = NULL;
    for (const k of kredite) {
      const r = restschuld(k, datum);
      rest = r === null || rest === null ? null : rest.plus(r);
    }
    return { datum, verkehrswert, restschuld: rest, sollMonat };
  });
}

/**
 * Belegte Restschuld heute nach Jahr des Zinsbindungsendes; variable Kredite unter "variabel".
 * Kredite ohne belegte Restschuld werden nicht geschätzt, sondern unter `ohneBeleg` gezählt.
 */
export function zinsbindungsProfil(
  kredite: KreditDaten[],
  stichtag: IsoDatum,
): Array<{ jahr: string; restschuld: Decimal; anzahl: number; ohneBeleg: number }> {
  const gruppen = new Map<string, { restschuld: Decimal; anzahl: number; ohneBeleg: number }>();
  for (const k of kredite) {
    const rest = restschuld(k, stichtag);
    if (rest !== null && rest.lessThanOrEqualTo(0)) continue;
    const jahr = k.zinsArt === "VARIABEL" || !k.zinsbindungBis ? "variabel" : k.zinsbindungBis < stichtag ? stichtag.slice(0, 4) : k.zinsbindungBis.slice(0, 4);
    const g = gruppen.get(jahr) ?? { restschuld: NULL, anzahl: 0, ohneBeleg: 0 };
    gruppen.set(jahr, { restschuld: g.restschuld.plus(rest ?? 0), anzahl: g.anzahl + 1, ohneBeleg: g.ohneBeleg + (rest === null ? 1 : 0) });
  }
  return [...gruppen.entries()]
    .map(([jahr, g]) => ({ jahr, ...g }))
    .sort((a, b) => (a.jahr === "variabel" ? -1 : b.jahr === "variabel" ? 1 : a.jahr.localeCompare(b.jahr)));
}
