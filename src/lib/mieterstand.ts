/**
 * Stände von Mieterlisten vergleichen.
 *
 * Jeder Stand ist eine Momentaufnahme je Haus. Der Vergleich zweier Stände wertet jede Änderung:
 * „besser“ (z. B. Mieterhöhung, Neuvermietung), „schlechter“ (Minderung, neuer Leerstand) oder
 * „neutral“ (Mieterwechsel, korrigierte Fläche). Fehlt ein Wert in einem der Stände, gilt er als
 * unbekannt und wird nie als Änderung auf 0 gewertet.
 */
import type { IsoDatum } from "./datum";
import { dezimal, type Decimal } from "./geld";
import { inFlaeche, type Nutzungsart } from "./nutzungsart";

export type StandArt = "VOLLSTAENDIG" | "NUR_LEERSTAND";

export interface StandZeile {
  /** Einheit-ID, sonst Bezeichnung (klein geschrieben) */
  schluessel: string;
  einheit: string;
  art: Nutzungsart;
  flaeche: Decimal | null;
  /** true = leer, false = vermietet, null = unbekannt */
  leer: boolean | null;
  mieter: string | null;
  beginn: IsoDatum | null;
  ende: IsoDatum | null;
  sollMiete: Decimal | null;
  istMiete: Decimal | null;
  nebenkosten: Decimal | null;
  erwarteteMiete: Decimal | null;
}

export interface Stand {
  id: string;
  hausId: string;
  stichtag: IsoDatum;
  art: StandArt;
  quelle: string;
  zeilen: StandZeile[];
}

export const STAND_FELDER = ["leer", "mieter", "sollMiete", "istMiete", "mieteJeQm", "nebenkosten", "flaeche", "beginn", "ende", "erwarteteMiete"] as const;
export type StandFeld = (typeof STAND_FELDER)[number];

export type Wertung = "besser" | "schlechter" | "neutral";
export type Wert = Decimal | string | boolean;

export interface FeldAenderung {
  feld: StandFeld;
  alt: Wert;
  neu: Wert;
  wertung: Wertung;
  /** nur bei Zahlen */
  differenz: Decimal | null;
  /** Differenz in Prozent des alten Werts; null bei altem Wert 0 */
  prozent: Decimal | null;
}

export type Ereignis = "mieterhoehung" | "minderung" | "neuvermietung" | "neuerLeerstand" | "mieterwechsel" | "korrektur" | "neu" | "entfallen";

export interface ZeilenVergleich {
  schluessel: string;
  /** Zeile im angezeigten Stand (fehlt, wenn die Einheit nur im Vergleichsstand vorkommt) */
  neu: StandZeile | null;
  alt: StandZeile | null;
  aenderungen: Partial<Record<StandFeld, FeldAenderung>>;
  ereignisse: Ereignis[];
  /** Auswirkung auf die Ist-Miete je Monat (für die Zusammenfassung); null = unbekannt */
  wirkung: Decimal | null;
}

/** Ist-Miete je m² (nur Wohnen und Gewerbe mit bekannter Fläche > 0). */
export function mieteJeQm(z: Pick<StandZeile, "art" | "flaeche" | "istMiete" | "leer">): Decimal | null {
  if (!inFlaeche(z.art) || z.leer !== false || !z.flaeche || z.flaeche.isZero() || !z.istMiete) return null;
  return z.istMiete.dividedBy(z.flaeche).toDecimalPlaces(2);
}

function wertVon(z: StandZeile, feld: StandFeld): Wert | null {
  if (feld === "mieteJeQm") return mieteJeQm(z);
  // Mietwerte einer leeren Einheit gibt es nicht; die erwartete Miete nur bei Leerstand.
  if ((feld === "sollMiete" || feld === "istMiete" || feld === "nebenkosten" || feld === "mieter" || feld === "beginn" || feld === "ende") && z.leer !== false) return null;
  if (feld === "erwarteteMiete" && z.leer !== true) return null;
  return z[feld];
}

const istZahl = (w: Wert): w is Decimal => typeof w === "object";

function gleich(a: Wert, b: Wert) {
  if (istZahl(a) && istZahl(b)) return a.equals(b);
  if (typeof a === "string" && typeof b === "string") return a.trim().toLowerCase() === b.trim().toLowerCase();
  return a === b;
}

/** Wertet eine Änderung eines Felds; `mieterGleich` unterscheidet Mieterhöhung von Mieterwechsel. */
function werte(feld: StandFeld, alt: Wert, neu: Wert): Wertung {
  if (feld === "leer") return neu === false ? "besser" : "schlechter";
  if ((feld === "istMiete" || feld === "sollMiete" || feld === "mieteJeQm" || feld === "erwarteteMiete") && istZahl(alt) && istZahl(neu)) {
    return neu.greaterThan(alt) ? "besser" : "schlechter";
  }
  return "neutral";
}

export function feldAenderung(feld: StandFeld, alt: Wert | null, neu: Wert | null): FeldAenderung | null {
  if (alt === null || neu === null || gleich(alt, neu)) return null;
  const zahl = istZahl(alt) && istZahl(neu);
  const differenz = zahl ? neu.minus(alt) : null;
  const prozent = zahl && !alt.isZero() ? neu.minus(alt).dividedBy(alt).times(100).toDecimalPlaces(2) : null;
  return { feld, alt, neu, wertung: werte(feld, alt, neu), differenz, prozent };
}

export function vergleicheZeile(alt: StandZeile | null, neu: StandZeile | null, schluessel: string): ZeilenVergleich {
  const aenderungen: ZeilenVergleich["aenderungen"] = {};
  const ereignisse: Ereignis[] = [];
  let wirkung: Decimal | null = dezimal(0);
  if (!alt || !neu) {
    if (alt || neu) ereignisse.push(neu ? "neu" : "entfallen");
    return { schluessel, neu, alt, aenderungen, ereignisse, wirkung: null };
  }
  for (const feld of STAND_FELDER) {
    const a = feldAenderung(feld, wertVon(alt, feld), wertVon(neu, feld));
    if (a) aenderungen[feld] = a;
  }
  // Ein Mieterwechsel bleibt neutral, auch wenn sich dabei die Miete ändert; die Miete selbst wird gewertet.
  if (alt.leer === false && neu.leer === false) {
    if (aenderungen.mieter) ereignisse.push("mieterwechsel");
    const ist = aenderungen.istMiete;
    if (ist && !aenderungen.mieter) ereignisse.push(ist.wertung === "besser" ? "mieterhoehung" : "minderung");
    wirkung = ist?.differenz ?? (alt.istMiete && neu.istMiete ? dezimal(0) : null);
  } else if (alt.leer === true && neu.leer === false) {
    ereignisse.push("neuvermietung");
    wirkung = neu.istMiete;
  } else if (alt.leer === false && neu.leer === true) {
    ereignisse.push("neuerLeerstand");
    wirkung = alt.istMiete ? alt.istMiete.negated() : null;
  } else {
    wirkung = null;
  }
  if (aenderungen.flaeche) ereignisse.push("korrektur");
  return { schluessel, neu, alt, aenderungen, ereignisse, wirkung };
}

/** Vergleicht zwei Stände desselben Hauses Einheit für Einheit. */
export function vergleicheStaende(alt: StandZeile[] | null, neu: StandZeile[]): ZeilenVergleich[] {
  const altNach = new Map((alt ?? []).map((z) => [z.schluessel, z]));
  const ergebnis = neu.map((z) => vergleicheZeile(alt ? (altNach.get(z.schluessel) ?? null) : z, z, z.schluessel));
  if (alt) {
    const neuSchluessel = new Set(neu.map((z) => z.schluessel));
    for (const z of alt) if (!neuSchluessel.has(z.schluessel)) ergebnis.push(vergleicheZeile(z, null, z.schluessel));
  }
  return ergebnis;
}

export const istGeaendert = (v: ZeilenVergleich) => Object.keys(v.aenderungen).length > 0 || v.ereignisse.length > 0;

// ---------------------------------------------------------------------------
// Summen

export interface SummenWert {
  wert: Decimal | null;
  /** mindestens ein Teil fehlt */
  unvollstaendig: boolean;
}

export interface StandSummen {
  istMonat: SummenWert;
  sollMonat: SummenWert;
  /** Wohn- und Gewerbefläche (ohne Stellplätze) */
  flaeche: SummenWert;
  leerFlaeche: SummenWert;
  /** Leerstandsfläche / Gesamtfläche in Prozent */
  leerQuote: SummenWert;
  /** Soll-Miete der leeren Einheiten (erwartete Miete) */
  entgangenMonat: SummenWert;
  einheiten: number;
  leereEinheiten: number;
  /** Einheiten mit unbekanntem Vermietungsstand */
  unbekannteEinheiten: number;
}

function summe(werte: Array<Decimal | null>): SummenWert {
  const bekannt = werte.filter((w): w is Decimal => w !== null);
  const unvollstaendig = bekannt.length < werte.length;
  return { wert: bekannt.length === 0 && werte.length > 0 ? null : bekannt.reduce((s, w) => s.plus(w), dezimal(0)), unvollstaendig };
}

export function standSummen(zeilen: StandZeile[]): StandSummen {
  const vermietet = zeilen.filter((z) => z.leer === false);
  const leer = zeilen.filter((z) => z.leer === true);
  const flaechig = zeilen.filter((z) => inFlaeche(z.art));
  const flaeche = summe(flaechig.map((z) => z.flaeche));
  const leerFlaeche = summe(flaechig.filter((z) => z.leer !== false).map((z) => (z.leer === true ? z.flaeche : null)));
  const quote: SummenWert =
    flaeche.wert && leerFlaeche.wert && !flaeche.wert.isZero()
      ? { wert: leerFlaeche.wert.dividedBy(flaeche.wert).times(100).toDecimalPlaces(2), unvollstaendig: flaeche.unvollstaendig || leerFlaeche.unvollstaendig }
      : { wert: null, unvollstaendig: true };
  return {
    istMonat: summe(vermietet.map((z) => z.istMiete)),
    sollMonat: summe([...vermietet.map((z) => z.sollMiete), ...leer.map((z) => z.erwarteteMiete)]),
    flaeche,
    leerFlaeche,
    leerQuote: quote,
    entgangenMonat: summe(leer.map((z) => z.erwarteteMiete)),
    einheiten: zeilen.length,
    leereEinheiten: leer.length,
    unbekannteEinheiten: zeilen.filter((z) => z.leer === null).length,
  };
}

/** Werte mehrerer Häuser zusammenzählen. */
export function addiereSummen(liste: StandSummen[]): StandSummen {
  const plus = (k: "istMonat" | "sollMonat" | "flaeche" | "leerFlaeche" | "entgangenMonat"): SummenWert => {
    const teile = liste.map((s) => s[k]);
    const bekannt = teile.filter((t) => t.wert !== null);
    return { wert: bekannt.length ? bekannt.reduce((s, t) => s.plus(t.wert!), dezimal(0)) : null, unvollstaendig: teile.some((t) => t.unvollstaendig || t.wert === null) };
  };
  const flaeche = plus("flaeche");
  const leerFlaeche = plus("leerFlaeche");
  return {
    istMonat: plus("istMonat"),
    sollMonat: plus("sollMonat"),
    flaeche,
    leerFlaeche,
    leerQuote:
      flaeche.wert && leerFlaeche.wert && !flaeche.wert.isZero()
        ? { wert: leerFlaeche.wert.dividedBy(flaeche.wert).times(100).toDecimalPlaces(2), unvollstaendig: flaeche.unvollstaendig || leerFlaeche.unvollstaendig }
        : { wert: null, unvollstaendig: true },
    entgangenMonat: plus("entgangenMonat"),
    einheiten: liste.reduce((s, x) => s + x.einheiten, 0),
    leereEinheiten: liste.reduce((s, x) => s + x.leereEinheiten, 0),
    unbekannteEinheiten: liste.reduce((s, x) => s + x.unbekannteEinheiten, 0),
  };
}

export const SUMMEN_FELDER = ["istMonat", "sollMonat", "flaeche", "leerFlaeche", "leerQuote", "entgangenMonat"] as const;
export type SummenFeld = (typeof SUMMEN_FELDER)[number];

/** Änderung einer Summenzeile; mehr Miete ist besser, mehr Leerstand schlechter, Fläche neutral. */
export function summenAenderung(feld: SummenFeld, alt: SummenWert, neu: SummenWert): (FeldAenderung & { unvollstaendig: boolean }) | null {
  if (alt.wert === null || neu.wert === null || alt.wert.equals(neu.wert)) return null;
  const differenz = neu.wert.minus(alt.wert);
  const hoeher = differenz.greaterThan(0);
  const wertung: Wertung = feld === "flaeche" ? "neutral" : feld === "istMonat" || feld === "sollMonat" ? (hoeher ? "besser" : "schlechter") : hoeher ? "schlechter" : "besser";
  return {
    feld: "istMiete",
    alt: alt.wert,
    neu: neu.wert,
    wertung,
    differenz,
    prozent: alt.wert.isZero() ? null : differenz.dividedBy(alt.wert).times(100).toDecimalPlaces(2),
    unvollstaendig: alt.unvollstaendig || neu.unvollstaendig,
  };
}

// ---------------------------------------------------------------------------
// Zusammenfassung

export const ZUSAMMENFASSUNG = ["mieterhoehung", "minderung", "neuvermietung", "neuerLeerstand", "mieterwechsel", "korrektur"] as const;
export type ZusammenfassungArt = (typeof ZUSAMMENFASSUNG)[number];

export interface ZusammenfassungEintrag {
  art: ZusammenfassungArt;
  anzahl: number;
  /** Summe der Wirkung auf die Ist-Miete je Monat; null bei neutralen Ereignissen */
  betrag: Decimal | null;
  /** mindestens eine Wirkung unbekannt */
  unvollstaendig: boolean;
}

export function zusammenfassung(vergleiche: ZeilenVergleich[]): ZusammenfassungEintrag[] {
  return ZUSAMMENFASSUNG.map((art) => {
    const treffer = vergleiche.filter((v) => v.ereignisse.includes(art));
    const mitBetrag = art !== "mieterwechsel" && art !== "korrektur";
    const betraege = treffer.map((v) => v.wirkung);
    return {
      art,
      anzahl: treffer.length,
      betrag: mitBetrag ? betraege.reduce<Decimal>((s, w) => s.plus(w ?? 0), dezimal(0)) : null,
      unvollstaendig: mitBetrag && betraege.some((w) => w === null),
    };
  }).filter((e) => e.anzahl > 0);
}

// ---------------------------------------------------------------------------
// Auswahl der Stände

/** Neuester Stand je Haus zum Stichtag (≤ Stichtag); bei gleichem Stichtag der zuletzt angelegte. */
export function standAm<T extends { stichtag: IsoDatum; erstelltAm: string }>(staende: T[], stichtag: IsoDatum): T | null {
  return staende.filter((s) => s.stichtag <= stichtag).sort((a, b) => b.stichtag.localeCompare(a.stichtag) || b.erstelltAm.localeCompare(a.erstelltAm))[0] ?? null;
}

/** Der Stichtag vor dem gewählten aus einer absteigend sortierten Liste. */
export function vorherigerStichtag(stichtage: IsoDatum[], stichtag: IsoDatum): IsoDatum | null {
  return [...stichtage].sort().reverse().find((s) => s < stichtag) ?? null;
}
