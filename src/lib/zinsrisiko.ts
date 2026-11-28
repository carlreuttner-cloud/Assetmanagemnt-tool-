/**
 * Zinsrisiko des Kreditbestands: gewichteter Durchschnittszins, durchschnittliche Restlaufzeit der
 * Zinsbindung, Anteile fest/variabel/abgesichert und Mehrkosten in den nächsten 12 Monaten bei
 * einem Zinsanstieg. Gewichtet wird mit der belegten Restschuld heute; Kredite ohne Beleg werden
 * gezählt, nicht geschätzt. Reine Funktionen.
 */
import { monateZwischen, plusMonate, type IsoDatum } from "./datum";
import { dezimal, type Decimal } from "./geld";
import { gesicherterSatz, referenzzinsAm, restschuldNachweis, type KreditDaten, type ReferenzWert, type RestschuldNachweis } from "./kredit";

export const SCHOCK_STANDARD = 100;
export const SCHOCK_MAX = 500;
/** Zeitraum der Mehrkosten-Rechnung in Monaten */
export const SCHOCK_MONATE = 12;

/** Basispunkte aus dem Seitenparameter; 1 bis 500, sonst 100. */
export function schockAus(wert: string | undefined): number {
  const n = Number(wert);
  return Number.isInteger(n) && n >= 1 && n <= SCHOCK_MAX ? n : SCHOCK_STANDARD;
}

export type Kategorie = "fest" | "festAbgelaufen" | "variabel";
export type RisikoLuecke = "restschuld" | "zinssatz" | "referenzzins" | "zinsbindung";

export interface Anteile {
  /** Festzins mit laufender Bindung */
  fest: Decimal;
  /** variabel, durch Swap oder Cap gesichert */
  abgesichert: Decimal;
  /** variabel ohne Sicherung oder Festzins mit abgelaufener Bindung */
  variabel: Decimal;
}

export interface KreditRisiko {
  kreditId: string;
  gesellschaftId: string;
  kategorie: Kategorie;
  nachweis: RestschuldNachweis | null;
  /** belegte Restschuld; null ohne Beleg */
  restschuld: Decimal | null;
  /** Zinssatz heute in Prozent */
  satz: Decimal | null;
  /** Beträge je Anteil (Summe = Restschuld); null ohne Restschuld */
  anteile: Anteile | null;
  /** gewichtete Restlaufzeit der Zinsbindung in Monaten (Sicherungen bis zu ihrem Ende, ungesichert 0) */
  bindungMonate: Decimal | null;
  /** Anstieg des Satzes im Schnitt der nächsten 12 Monate in Prozentpunkten */
  anstieg: Decimal | null;
  /** Mehrkosten in den nächsten 12 Monaten auf die Restschuld heute */
  mehrkosten: Decimal | null;
  luecken: RisikoLuecke[];
}

const NULL = dezimal(0);

function kategorie(k: KreditDaten, stichtag: IsoDatum): Kategorie {
  if (k.zinsArt === "VARIABEL") return "variabel";
  return k.zinsbindungBis && k.zinsbindungBis < stichtag ? "festAbgelaufen" : "fest";
}

/** Risiko eines Kredits; null für getilgte oder noch nicht ausgezahlte Kredite. */
export function kreditRisiko(k: KreditDaten, referenzwerte: ReferenzWert[], stichtag: IsoDatum, schockBp: number): KreditRisiko | null {
  const nachweis = restschuldNachweis(k, stichtag);
  if (nachweis && (nachweis.herkunft === "nichtAusgezahlt" || nachweis.betrag.lessThanOrEqualTo(0))) return null;
  const rest = nachweis?.betrag ?? null;
  const kat = kategorie(k, stichtag);
  const schock = dezimal(schockBp).dividedBy(100);
  const luecken: RisikoLuecke[] = [];
  if (rest === null) luecken.push("restschuld");

  let satz: Decimal | null = null;
  let anteile: Anteile | null = null;
  let bindungMonate: Decimal | null = null;
  let anstieg: Decimal | null = null;

  if (kat !== "variabel") {
    satz = k.sollzins;
    if (satz === null) luecken.push("zinssatz");
    if (rest !== null) anteile = kat === "fest" ? { fest: rest, abgesichert: NULL, variabel: NULL } : { fest: NULL, abgesichert: NULL, variabel: rest };
    if (kat === "festAbgelaufen") {
      bindungMonate = NULL;
      anstieg = schock;
    } else if (!k.zinsbindungBis) {
      luecken.push("zinsbindung");
    } else {
      const bis = k.zinsbindungBis;
      bindungMonate = dezimal(Math.max(0, monateZwischen(stichtag, bis)));
      // Monate nach Ende der Bindung tragen den Anstieg voll (Anschlusszins offen)
      let offen = 0;
      for (let m = 0; m < SCHOCK_MONATE; m++) if (plusMonate(stichtag, m) > bis) offen++;
      anstieg = schock.times(offen).dividedBy(SCHOCK_MONATE);
    }
  } else {
    const ref = k.referenzzins ? referenzzinsAm(referenzwerte, k.referenzzins, stichtag) : null;
    if (!ref) luecken.push("referenzzins");
    if (rest !== null) {
      // Anteile und Bindung hängen nur an den Sicherungen, nicht an der Höhe des Referenzzinses
      const g = gesicherterSatz(k, ref?.satz ?? NULL, stichtag, rest);
      if (g) {
        const gesichert = g.teile.filter((t) => t.sicherung).reduce((s, t) => s.plus(t.anteil), NULL);
        anteile = { fest: NULL, abgesichert: rest.times(gesichert), variabel: rest.minus(rest.times(gesichert)) };
        bindungMonate = g.teile.reduce((s, t) => (t.sicherung ? s.plus(t.anteil.times(Math.max(0, monateZwischen(stichtag, t.sicherung.ende)))) : s), NULL);
        if (ref) {
          satz = g.satz;
          let summe = NULL;
          for (let m = 0; m < SCHOCK_MONATE; m++) {
            const tag = plusMonate(stichtag, m);
            const vorher = gesicherterSatz(k, ref.satz, tag, rest);
            const nachher = gesicherterSatz(k, ref.satz.plus(schock), tag, rest);
            if (vorher && nachher) summe = summe.plus(nachher.satz.minus(vorher.satz));
          }
          anstieg = summe.dividedBy(SCHOCK_MONATE);
        }
      }
    }
  }

  const mehrkosten = rest !== null && anstieg !== null ? rest.times(anstieg).dividedBy(100) : null;
  return { kreditId: k.id, gesellschaftId: k.gesellschaftId, kategorie: kat, nachweis, restschuld: rest, satz, anteile, bindungMonate, anstieg, mehrkosten, luecken };
}

export interface Gewichtet {
  wert: Decimal | null;
  /** Kredite (mit Restschuld), die in den Wert eingehen */
  bekannt: number;
  /** Kredite mit Restschuld, denen der Einzelwert fehlt */
  fehlend: number;
}

export interface GruppenRisiko {
  anzahl: number;
  /** Kredite ohne belegte Restschuld */
  ohneBeleg: number;
  restschuld: Decimal;
  stichtagVon: IsoDatum | null;
  stichtagBis: IsoDatum | null;
  durchschnittszins: Gewichtet;
  /** gewichtete Restlaufzeit der Zinsbindung in Jahren */
  bindungJahre: Gewichtet;
  anteile: Anteile;
  /** Anteile in Prozent der belegten Restschuld; null ohne Restschuld */
  anteileProzent: Anteile | null;
  mehrkosten: Decimal;
  /** Kredite mit Restschuld, deren Mehrkosten unbekannt sind */
  mehrkostenFehlend: number;
}

function gewichtet(risiken: KreditRisiko[], wert: (r: KreditRisiko) => Decimal | null, faktor = dezimal(1)): Gewichtet {
  let summe = NULL;
  let gewicht = NULL;
  let bekannt = 0;
  let fehlend = 0;
  for (const r of risiken) {
    if (r.restschuld === null) continue;
    const w = wert(r);
    if (w === null) {
      fehlend++;
      continue;
    }
    summe = summe.plus(w.times(r.restschuld));
    gewicht = gewicht.plus(r.restschuld);
    bekannt++;
  }
  return { wert: gewicht.isZero() ? null : summe.dividedBy(gewicht).dividedBy(faktor), bekannt, fehlend };
}

export function gruppenRisiko(risiken: KreditRisiko[]): GruppenRisiko {
  const mitRest = risiken.filter((r) => r.restschuld !== null);
  const restschuld = mitRest.reduce((s, r) => s.plus(r.restschuld!), NULL);
  const anteile: Anteile = { fest: NULL, abgesichert: NULL, variabel: NULL };
  for (const r of mitRest) {
    if (!r.anteile) continue;
    anteile.fest = anteile.fest.plus(r.anteile.fest);
    anteile.abgesichert = anteile.abgesichert.plus(r.anteile.abgesichert);
    anteile.variabel = anteile.variabel.plus(r.anteile.variabel);
  }
  const prozent = (w: Decimal) => w.dividedBy(restschuld).times(100);
  const tage = mitRest.map((r) => r.nachweis!.stichtag).sort();
  return {
    anzahl: risiken.length,
    ohneBeleg: risiken.length - mitRest.length,
    restschuld,
    stichtagVon: tage[0] ?? null,
    stichtagBis: tage[tage.length - 1] ?? null,
    durchschnittszins: gewichtet(risiken, (r) => r.satz),
    bindungJahre: gewichtet(risiken, (r) => r.bindungMonate, dezimal(12)),
    anteile,
    anteileProzent: restschuld.isZero() ? null : { fest: prozent(anteile.fest), abgesichert: prozent(anteile.abgesichert), variabel: prozent(anteile.variabel) },
    mehrkosten: mitRest.reduce((s, r) => (r.mehrkosten ? s.plus(r.mehrkosten) : s), NULL),
    mehrkostenFehlend: mitRest.filter((r) => r.mehrkosten === null).length,
  };
}

