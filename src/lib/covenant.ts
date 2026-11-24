/**
 * Covenant-Headroom: wie viel Puffer bis zur Grenze eines Covenants oder einer
 * Ausschüttungssperre bleibt. Reine Funktionen.
 *
 * Grundlage sind die Werte aus `covenantKennzahlen` (alle Häuser, die der Kredit belastet, mit
 * allen Krediten dieser Häuser anteilig). Der Puffer wird zweifach angegeben:
 * - als Abstand der Kennzahl zum Schwellenwert (LTV in Prozentpunkten, DSCR/ICR als Faktor) und
 *   relativ zum Schwellenwert in Prozent,
 * - als Spielraum der Grundlage, jeweils unter sonst gleichen Bedingungen:
 *   LTV höchstens X:  Verkehrswert darf um V − R × 100 / X sinken; Restschuld darf um V × X / 100 − R steigen.
 *   DSCR mindestens X: Ist-Jahresmiete darf um M − KD × X sinken; Kapitaldienst darf um M / X − KD steigen.
 *   ICR mindestens X:  Ist-Jahresmiete darf um M − Z × X sinken; Zinsen dürfen um M / X − Z steigen.
 * Negative Werte bedeuten: so viel fehlt, um die Bedingung wieder einzuhalten.
 * Ist eine Grundlage unbekannt, ist auch der Puffer unbekannt (null).
 */
import { aufCent, type Decimal } from "./geld";
import type { Kennzahlen } from "./kennzahlen";
import { pruefeCovenant } from "./kredit";

export type Folge = "COVENANT" | "AUSSCHUETTUNGSSPERRE";

export type SpielraumArt = "verkehrswertRueckgang" | "restschuldAnstieg" | "mieteRueckgang" | "kapitaldienstAnstieg" | "zinsAnstieg";

export interface Spielraum {
  art: SpielraumArt;
  /** Betrag in Währung; negativ = fehlt */
  betrag: Decimal;
  /** bezogen auf den heutigen Wert der Grundlage in Prozent */
  prozent: Decimal;
  /** heutiger Wert der Grundlage */
  basis: Decimal;
}

export interface CovenantPuffer {
  wert: Decimal;
  schwellenwert: Decimal;
  eingehalten: boolean;
  /** in der Einheit der Kennzahl; positiv = Puffer, negativ = verletzt */
  abstand: Decimal;
  /** Abstand relativ zum Schwellenwert in Prozent */
  abstandRelativ: Decimal | null;
  spielraum: Spielraum[];
}

type Bedingung = { kennzahl: string; vergleich: "HOECHSTENS" | "MINDESTENS" | null; schwellenwert: Decimal | null };

/** Puffer einer Bedingung oder null, wenn sie nicht automatisch prüfbar ist oder Grundlagen fehlen. */
export function covenantPuffer(c: Bedingung, kz: Kennzahlen): CovenantPuffer | null {
  const p = pruefeCovenant(c, { LTV: kz.ltv, DSCR: kz.dscr, ICR: kz.icr });
  if (p.eingehalten === null || !p.wert || !c.vergleich || c.schwellenwert === null) return null;
  const x = c.schwellenwert;
  const abstand = c.vergleich === "HOECHSTENS" ? x.minus(p.wert) : p.wert.minus(x);
  const abstandRelativ = x.isZero() ? null : abstand.dividedBy(x.abs()).times(100);

  const spielraum: Spielraum[] = [];
  const raum = (art: SpielraumArt, betrag: Decimal, basis: Decimal) => {
    if (!basis.isZero()) spielraum.push({ art, betrag: aufCent(betrag), prozent: betrag.dividedBy(basis).times(100), basis });
  };
  const k = c.kennzahl.trim().toUpperCase();
  if (k === "LTV" && c.vergleich === "HOECHSTENS" && x.greaterThan(0)) {
    raum("verkehrswertRueckgang", kz.verkehrswert.minus(kz.restschuld.times(100).dividedBy(x)), kz.verkehrswert);
    raum("restschuldAnstieg", kz.verkehrswert.times(x).dividedBy(100).minus(kz.restschuld), kz.restschuld);
  } else if (k === "DSCR" && c.vergleich === "MINDESTENS" && x.greaterThan(0)) {
    raum("mieteRueckgang", kz.istJahr.minus(kz.kapitaldienstJahr.times(x)), kz.istJahr);
    raum("kapitaldienstAnstieg", kz.istJahr.dividedBy(x).minus(kz.kapitaldienstJahr), kz.kapitaldienstJahr);
  } else if (k === "ICR" && c.vergleich === "MINDESTENS" && x.greaterThan(0)) {
    raum("mieteRueckgang", kz.istJahr.minus(kz.zinsenJahr.times(x)), kz.istJahr);
    raum("zinsAnstieg", kz.istJahr.dividedBy(x).minus(kz.zinsenJahr), kz.zinsenJahr);
  }
  return { wert: p.wert, schwellenwert: x, eingehalten: p.eingehalten, abstand, abstandRelativ, spielraum };
}

export type SperrenStatus = "aktiv" | "frei" | "manuell";

/** Status einer Ausschüttungssperre: aktiv, wenn die Bedingung verletzt ist; manuell, wenn nicht prüfbar. */
export function sperrenStatus(puffer: CovenantPuffer | null): SperrenStatus {
  if (!puffer) return "manuell";
  return puffer.eingehalten ? "frei" : "aktiv";
}
