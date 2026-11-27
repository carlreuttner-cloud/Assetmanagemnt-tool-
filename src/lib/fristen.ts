/**
 * Fristen-Kalender: Zinsbindungsenden, Kreditlaufzeiten, Mietvertragsenden und mögliche
 * Mieterhöhungen. Reine Funktionen ohne Datenbank.
 *
 * Mieterhöhung (nur Wohnraum, Vergleichsmiete nach § 558 BGB): Das Erhöhungsverlangen ist
 * frühestens 12 Monate nach Mietbeginn bzw. nach Wirksamwerden der letzten Erhöhung möglich,
 * wirksam wird die Erhöhung frühestens 15 Monate danach. Staffel- und Indexmieten sowie
 * Gewerbemieten folgen dem Vertrag; diese Regeln sind nicht erfasst und werden als Lücke gezeigt.
 */
import { plusMonate, type IsoDatum } from "./datum";

export const FRIST_ARTEN = ["zinsbindung", "kreditende", "mietende", "mieterhoehung"] as const;
export type FristArt = (typeof FRIST_ARTEN)[number];

export type Frist = {
  art: FristArt;
  datum: IsoDatum;
  /** Objekt, z. B. Kredit- oder Einheitsbezeichnung */
  titel: string;
  unter: string;
  href: string;
  gesellschaftId: string;
  /** Kurze Herleitung des Datums (Quelle und Regel) */
  grundlage: string;
};

export type FristLuecke = { art: FristArt; titel: string; unter: string; href: string; grund: string };

export type MieterhoehungErgebnis =
  | { art: "moeglich"; verlangenAb: IsoDatum; wirksamAb: IsoDatum; basis: "letzteErhoehung" | "mietbeginn"; basisDatum: IsoDatum }
  | { art: "unbekannt"; grund: "gewerbe" };

/** Frühestes Erhöhungsverlangen und Wirksamwerden nach § 558 BGB (nur Wohnraum). */
export function naechsteMieterhoehung(mv: { einheitArt: "WOHNUNG" | "GEWERBE"; beginn: IsoDatum; letzteMieterhoehung: IsoDatum | null }): MieterhoehungErgebnis {
  if (mv.einheitArt !== "WOHNUNG") return { art: "unbekannt", grund: "gewerbe" };
  const basis = mv.letzteMieterhoehung && mv.letzteMieterhoehung > mv.beginn ? "letzteErhoehung" : "mietbeginn";
  const basisDatum = basis === "letzteErhoehung" ? mv.letzteMieterhoehung! : mv.beginn;
  return { art: "moeglich", verlangenAb: plusMonate(basisDatum, 12), wirksamAb: plusMonate(basisDatum, 15), basis, basisDatum };
}

export type FristTexte = {
  grundZinsbindung: string;
  grundKreditende: string;
  grundMietende: string;
  grundMieterhoehung: string;
  basisLetzte: string;
  basisBeginn: string;
  gewerbe: string;
};

export type FristEingabe = {
  kredite: Array<{ id: string; bezeichnung: string; gesellschaftId: string; gesellschaft: string; zinsArt: "FEST" | "VARIABEL"; zinsbindungBis: IsoDatum | null; laufzeitBis: IsoDatum | null }>;
  mietverhaeltnisse: Array<{
    id: string;
    mieter: string;
    einheit: string;
    einheitArt: "WOHNUNG" | "GEWERBE";
    haus: string;
    gesellschaftId: string;
    beginn: IsoDatum;
    ende: IsoDatum | null;
    letzteMieterhoehung: IsoDatum | null;
  }>;
};

const fuelle = (text: string, werte: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_, k: string) => werte[k] ?? "");

/**
 * Sammelt alle Fristen bis `bis` (einschließlich). Abgelaufene Zinsbindungen und Kreditenden
 * sowie schon mögliche Mieterhöhungen bleiben enthalten (Datum vor dem Stichtag), damit sie
 * als „fällig“ sichtbar sind. Beendete Mietverhältnisse werden übersprungen.
 */
export function sammleFristen(e: FristEingabe, stichtag: IsoDatum, bis: IsoDatum | null, t: FristTexte, datum: (d: IsoDatum) => string) {
  const fristen: Frist[] = [];
  const luecken: FristLuecke[] = [];
  const imRahmen = (d: IsoDatum) => bis === null || d <= bis;

  for (const k of e.kredite) {
    const href = `/gesellschaften/kredite/${k.id}`;
    if (k.zinsArt === "FEST" && k.zinsbindungBis && imRahmen(k.zinsbindungBis)) {
      fristen.push({ art: "zinsbindung", datum: k.zinsbindungBis, titel: k.bezeichnung, unter: k.gesellschaft, href, gesellschaftId: k.gesellschaftId, grundlage: t.grundZinsbindung });
    }
    if (k.laufzeitBis && imRahmen(k.laufzeitBis)) {
      fristen.push({ art: "kreditende", datum: k.laufzeitBis, titel: k.bezeichnung, unter: k.gesellschaft, href, gesellschaftId: k.gesellschaftId, grundlage: t.grundKreditende });
    }
  }

  for (const m of e.mietverhaeltnisse) {
    if (m.ende && m.ende < stichtag) continue; // beendet
    const href = `/mieter/vertraege/${m.id}`;
    const titel = `${m.einheit} · ${m.haus}`;
    if (m.ende && imRahmen(m.ende)) {
      fristen.push({ art: "mietende", datum: m.ende, titel, unter: m.mieter, href, gesellschaftId: m.gesellschaftId, grundlage: t.grundMietende });
    }
    const erh = naechsteMieterhoehung(m);
    if (erh.art === "unbekannt") {
      luecken.push({ art: "mieterhoehung", titel, unter: m.mieter, href, grund: t.gewerbe });
    } else if (imRahmen(erh.verlangenAb) && (!m.ende || erh.wirksamAb <= m.ende)) {
      fristen.push({
        art: "mieterhoehung",
        datum: erh.verlangenAb,
        titel,
        unter: m.mieter,
        href,
        gesellschaftId: m.gesellschaftId,
        grundlage: fuelle(t.grundMieterhoehung, {
          basis: fuelle(erh.basis === "letzteErhoehung" ? t.basisLetzte : t.basisBeginn, { datum: datum(erh.basisDatum) }),
          wirksam: datum(erh.wirksamAb),
        }),
      });
    }
  }

  fristen.sort((a, b) => (a.datum === b.datum ? a.titel.localeCompare(b.titel) : a.datum < b.datum ? -1 : 1));
  return { fristen, luecken };
}

/** Teilt in „fällig/überschritten“ (vor dem Stichtag) und kommende Fristen je Monat (JJJJ-MM). */
export function nachMonat(fristen: Frist[], stichtag: IsoDatum) {
  const faellig = fristen.filter((f) => f.datum < stichtag);
  const monate = new Map<string, Frist[]>();
  for (const f of fristen.filter((x) => x.datum >= stichtag)) {
    const m = f.datum.slice(0, 7);
    monate.set(m, [...(monate.get(m) ?? []), f]);
  }
  return { faellig, monate: [...monate.entries()] };
}
