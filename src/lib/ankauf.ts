/**
 * Ankaufsprüfung: ein neues Objekt mit Kaufpreis und Finanzierung durchrechnen und zeigen, wie
 * sich die Kennzahlen der Gesellschaft und des Portfolios ändern. Alle Werte des Objekts sind
 * Eingaben (Annahmen); fehlende optionale Angaben bleiben unbekannt. Reine Funktionen.
 */
import type { IsoDatum } from "./datum";
import { dezimal, parseBetrag, type Decimal } from "./geld";
import { addiere, kennzahlenAus, leereSummen, type Kennzahlen, type Summen, type Vollstaendigkeit } from "./kennzahlen";
import { jahresNettokaltmiete } from "./miete";

export interface AnkaufEingabe {
  gesellschaftId: string;
  kaufpreis: Decimal;
  /** Erwerbsnebenkosten in Prozent des Kaufpreises (Grunderwerbsteuer, Notar, Makler) */
  nebenkostenProzent: Decimal | null;
  /** Wert für den LTV (z. B. Kaufpreis oder Gutachten) */
  wert: Decimal;
  /** Nettokaltmiete pro Monat */
  mieteMonat: Decimal;
  /** nicht umlagefähige Bewirtschaftungskosten pro Jahr */
  bewirtschaftungJahr: Decimal | null;
  darlehen: Decimal;
  /** Sollzins in Prozent p. a. */
  zins: Decimal;
  /** anfängliche Tilgung in Prozent p. a. */
  tilgung: Decimal;
}

export const ANKAUF_FELDER = ["gesellschaft", "kaufpreis", "nebenkosten", "wert", "miete", "bewirtschaftung", "darlehen", "zins", "tilgung"] as const;
export type AnkaufFeld = (typeof ANKAUF_FELDER)[number];
const PFLICHT: AnkaufFeld[] = ["gesellschaft", "kaufpreis", "wert", "miete", "darlehen", "zins", "tilgung"];

export type AnkaufLesen = { eingabe: AnkaufEingabe; fehler: [] } | { eingabe: null; fehler: Array<{ feld: AnkaufFeld; art: "fehlt" | "ungueltig" }> };

/** Liest die Seitenparameter; null ohne Parameter (leeres Formular). */
export function leseAnkauf(werte: Partial<Record<AnkaufFeld, string>>, sprache = "de-DE"): AnkaufLesen | null {
  if (ANKAUF_FELDER.every((f) => !werte[f]?.trim())) return null;
  const fehler: Array<{ feld: AnkaufFeld; art: "fehlt" | "ungueltig" }> = [];
  const zahl = (feld: AnkaufFeld): Decimal | null => {
    const roh = werte[feld]?.trim();
    if (!roh) {
      if (PFLICHT.includes(feld)) fehler.push({ feld, art: "fehlt" });
      return null;
    }
    try {
      const d = parseBetrag(roh, sprache);
      if (d.isNegative()) throw new TypeError("negativ");
      return d;
    } catch {
      fehler.push({ feld, art: "ungueltig" });
      return null;
    }
  };
  const gesellschaftId = werte.gesellschaft?.trim() ?? "";
  if (!gesellschaftId) fehler.push({ feld: "gesellschaft", art: "fehlt" });
  const e = {
    kaufpreis: zahl("kaufpreis"),
    nebenkostenProzent: zahl("nebenkosten"),
    wert: zahl("wert"),
    mieteMonat: zahl("miete"),
    bewirtschaftungJahr: zahl("bewirtschaftung"),
    darlehen: zahl("darlehen"),
    zins: zahl("zins"),
    tilgung: zahl("tilgung"),
  };
  if (e.kaufpreis?.isZero()) fehler.push({ feld: "kaufpreis", art: "ungueltig" });
  if (e.wert?.isZero()) fehler.push({ feld: "wert", art: "ungueltig" });
  if (fehler.length > 0) return { eingabe: null, fehler };
  return { eingabe: { gesellschaftId, ...(e as Omit<AnkaufEingabe, "gesellschaftId" | "nebenkostenProzent" | "bewirtschaftungJahr">), nebenkostenProzent: e.nebenkostenProzent, bewirtschaftungJahr: e.bewirtschaftungJahr }, fehler: [] };
}

export interface ObjektKennzahlen {
  jahresmiete: Decimal;
  nebenkosten: Decimal | null;
  gesamtinvestition: Decimal | null;
  eigenkapital: Decimal | null;
  zinsenJahr: Decimal;
  tilgungJahr: Decimal;
  kapitaldienstJahr: Decimal;
  /** Jahresmiete − Bewirtschaftung */
  reinertrag: Decimal | null;
  /** Reinertrag − Kapitaldienst */
  cashflow: Decimal | null;
  bruttoanfangsrendite: Decimal;
  kaufpreisfaktor: Decimal | null;
  /** Reinertrag / Gesamtinvestition in Prozent */
  nettoanfangsrendite: Decimal | null;
  ltv: Decimal;
  /** Jahresmiete / Kapitaldienst (wie im Bestand) */
  dscr: Decimal | null;
  icr: Decimal | null;
  /** Cashflow / Eigenkapital in Prozent */
  cashOnCash: Decimal | null;
}

export function objektKennzahlen(e: AnkaufEingabe): ObjektKennzahlen {
  const jahresmiete = jahresNettokaltmiete(e.mieteMonat);
  const nebenkosten = e.nebenkostenProzent === null ? null : e.kaufpreis.times(e.nebenkostenProzent).dividedBy(100);
  const gesamtinvestition = nebenkosten === null ? null : e.kaufpreis.plus(nebenkosten);
  const eigenkapital = gesamtinvestition === null ? null : gesamtinvestition.minus(e.darlehen);
  const zinsenJahr = e.darlehen.times(e.zins).dividedBy(100);
  const tilgungJahr = e.darlehen.times(e.tilgung).dividedBy(100);
  const kapitaldienstJahr = zinsenJahr.plus(tilgungJahr);
  const reinertrag = e.bewirtschaftungJahr === null ? null : jahresmiete.minus(e.bewirtschaftungJahr);
  const cashflow = reinertrag === null ? null : reinertrag.minus(kapitaldienstJahr);
  return {
    jahresmiete,
    nebenkosten,
    gesamtinvestition,
    eigenkapital,
    zinsenJahr,
    tilgungJahr,
    kapitaldienstJahr,
    reinertrag,
    cashflow,
    bruttoanfangsrendite: jahresmiete.times(100).dividedBy(e.kaufpreis),
    kaufpreisfaktor: jahresmiete.isZero() ? null : e.kaufpreis.dividedBy(jahresmiete),
    nettoanfangsrendite: reinertrag === null || gesamtinvestition === null ? null : reinertrag.times(100).dividedBy(gesamtinvestition),
    ltv: e.darlehen.times(100).dividedBy(e.wert),
    dscr: kapitaldienstJahr.isZero() ? null : jahresmiete.dividedBy(kapitaldienstJahr),
    icr: zinsenJahr.isZero() ? null : jahresmiete.dividedBy(zinsenJahr),
    cashOnCash: cashflow === null || eigenkapital === null || !eigenkapital.greaterThan(0) ? null : cashflow.times(100).dividedBy(eigenkapital),
  };
}

const bekannt = (stichtag: IsoDatum): Vollstaendigkeit => ({ bekannt: 1, fehlend: 0, von: stichtag, bis: stichtag, geschaetzt: 0 });

/** Summen des neuen Objekts im Format des Bestands (voll vermietet zur eingegebenen Miete, Kapitaldienst des ersten Jahres). */
export function ankaufSummen(e: AnkaufEingabe, stichtag: IsoDatum): Summen {
  const s = leereSummen();
  const o = objektKennzahlen(e);
  s.haeuser = 1;
  s.verkehrswert = e.wert;
  s.kaufpreis = e.kaufpreis;
  s.sollMonat = e.mieteMonat;
  s.istMonat = e.mieteMonat;
  s.restschuld = e.darlehen;
  s.zinsenJahr = o.zinsenJahr;
  s.tilgungJahr = o.tilgungJahr;
  s.luecken = { verkehrswert: bekannt(stichtag), kaufpreis: bekannt(stichtag), restschuld: bekannt(stichtag), kapitaldienst: bekannt(stichtag), erwarteteMiete: { ...bekannt(stichtag), bekannt: 0 } };
  return s;
}

export interface Vergleich {
  vorher: Kennzahlen;
  nachher: Kennzahlen;
}

/** Bestand vorher und mit dem neuen Objekt. */
export function vergleich(bestand: Summen, e: AnkaufEingabe, stichtag: IsoDatum): Vergleich {
  return { vorher: kennzahlenAus(bestand), nachher: kennzahlenAus(addiere(bestand, ankaufSummen(e, stichtag))) };
}

export const VERGLEICH_ZEILEN = ["verkehrswert", "restschuld", "ltv", "istJahr", "kapitaldienstJahr", "dscr", "icr"] as const;
export type VergleichZeile = (typeof VERGLEICH_ZEILEN)[number];

/** Differenz nachher − vorher; null, wenn eine Seite unbekannt ist. */
export function differenz(v: Vergleich, z: VergleichZeile): Decimal | null {
  const a = v.vorher[z];
  const b = v.nachher[z];
  return a === null || b === null ? null : dezimal(b).minus(a);
}
