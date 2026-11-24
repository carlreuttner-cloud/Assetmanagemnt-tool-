/**
 * Gutachten: abgeleitete Prüfwerte aus den Angaben eines Verkehrswertgutachtens. Reine Funktionen.
 *
 * Es wird nichts geschätzt: Jeder Prüfwert entsteht nur, wenn alle nötigen Angaben im Gutachten
 * stehen, sonst ist er null. Die rechnerischen Kontrollen (Barwertfaktor, Ertragswert) folgen dem
 * allgemeinen Ertragswertverfahren (ImmoWertV) und dienen nur dem Abgleich mit dem Gutachten.
 */
import { dezimal, type Decimal } from "./geld";
import type { IsoDatum } from "./datum";

export interface GutachtenDaten {
  id: string;
  stichtag: IsoDatum;
  verkehrswert: Decimal;
  rohertragJahr: Decimal | null;
  bewirtschaftungskosten: Decimal | null;
  reinertragJahr: Decimal | null;
  liegenschaftszins: Decimal | null;
  restnutzungsdauer: number | null;
  barwertfaktor: Decimal | null;
  bodenwert: Decimal | null;
  ertragswert: Decimal | null;
  wohnflaeche: Decimal | null;
  gewerbeflaeche: Decimal | null;
}

export interface GutachtenPruefwerte {
  /** Rohertrag − Bewirtschaftungskosten */
  reinertrag: Decimal | null;
  /** Bewirtschaftungskosten in Prozent des Rohertrags */
  bewirtschaftungskostenProzent: Decimal | null;
  /** Verkehrswert ÷ Rohertrag (Rohertragsvervielfältiger) */
  rohertragsfaktor: Decimal | null;
  /** Verkehrswert je m² Wohn- und Gewerbefläche */
  wertProM2: Decimal | null;
  /** Barwertfaktor aus Liegenschaftszins und Restnutzungsdauer */
  barwertfaktor: Decimal | null;
  /** (Reinertrag − Bodenwert × Liegenschaftszins) × Barwertfaktor + Bodenwert */
  ertragswert: Decimal | null;
  /** Veränderung des Verkehrswerts zum vorherigen Gutachten */
  veraenderung: Decimal | null;
  veraenderungProzent: Decimal | null;
}

/** Barwertfaktor (Kapitalisierung) = ((1 + p)^n − 1) / ((1 + p)^n × p), p als Dezimalzahl. */
export function barwertfaktor(liegenschaftszinsProzent: Decimal, restnutzungsdauer: number): Decimal | null {
  if (restnutzungsdauer <= 0) return null;
  const p = liegenschaftszinsProzent.dividedBy(100);
  if (p.isZero()) return dezimal(restnutzungsdauer);
  const q = p.plus(1).pow(restnutzungsdauer);
  return q.minus(1).dividedBy(q.times(p));
}

export function pruefwerte(g: GutachtenDaten, vorher: GutachtenDaten | null): GutachtenPruefwerte {
  const reinertrag = g.rohertragJahr && g.bewirtschaftungskosten ? g.rohertragJahr.minus(g.bewirtschaftungskosten) : null;
  const flaeche = g.wohnflaeche || g.gewerbeflaeche ? (g.wohnflaeche ?? dezimal(0)).plus(g.gewerbeflaeche ?? 0) : null;
  const bwf = g.liegenschaftszins && g.restnutzungsdauer ? barwertfaktor(g.liegenschaftszins, g.restnutzungsdauer) : null;
  const rein = g.reinertragJahr ?? reinertrag;
  const faktor = g.barwertfaktor ?? bwf;
  const ertragswert =
    rein && g.bodenwert && g.liegenschaftszins && faktor
      ? rein.minus(g.bodenwert.times(g.liegenschaftszins).dividedBy(100)).times(faktor).plus(g.bodenwert)
      : null;
  return {
    reinertrag,
    bewirtschaftungskostenProzent:
      g.rohertragJahr && g.bewirtschaftungskosten && !g.rohertragJahr.isZero() ? g.bewirtschaftungskosten.dividedBy(g.rohertragJahr).times(100) : null,
    rohertragsfaktor: g.rohertragJahr && !g.rohertragJahr.isZero() ? g.verkehrswert.dividedBy(g.rohertragJahr) : null,
    wertProM2: flaeche && !flaeche.isZero() ? g.verkehrswert.dividedBy(flaeche) : null,
    barwertfaktor: bwf,
    ertragswert,
    veraenderung: vorher ? g.verkehrswert.minus(vorher.verkehrswert) : null,
    veraenderungProzent: vorher && !vorher.verkehrswert.isZero() ? g.verkehrswert.minus(vorher.verkehrswert).dividedBy(vorher.verkehrswert).times(100) : null,
  };
}

/** Gutachten nach Stichtag absteigend mit Prüfwerten und Vergleich zum jeweils vorherigen. */
export function gutachtenVerlauf<T extends GutachtenDaten>(liste: T[]): Array<{ g: T; p: GutachtenPruefwerte }> {
  const sortiert = [...liste].sort((a, b) => (a.stichtag < b.stichtag ? 1 : a.stichtag > b.stichtag ? -1 : 0));
  return sortiert.map((g, i) => ({ g, p: pruefwerte(g, sortiert[i + 1] ?? null) }));
}

/** SWOT-Text (ein Punkt je Zeile) als Liste. */
export function swotPunkte(text: string | null): string[] {
  return (text ?? "")
    .split(/\r?\n/)
    .map((z) => z.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
}


