/**
 * Covenant-Nachweis für die Bank: Testtermine je Covenant und ein eingefrorener Stand aller Werte
 * zum Stichtag (Inhalt des PDFs). Reine Funktionen; gerechnet wird wie auf der Kreditseite mit
 * `covenantKennzahlen` (alle Häuser, die der Kredit belastet, mit allen Krediten dieser Häuser
 * anteilig). Unbekannte Werte bleiben null und werden als Lücke aufgeführt.
 */
import { covenantPuffer } from "./covenant";
import { monatsende, monatsNummer, plusMonate, type IsoDatum } from "./datum";
import { dezimal, type Decimal } from "./geld";
import { covenantKennzahlen, hausSummen, type HausDaten } from "./kennzahlen";
import { kapitaldienstJahr, pruefeCovenant, restschuldNachweis, type KreditDaten, type ReferenzWert } from "./kredit";

export const TEST_INTERVALLE = [1, 3, 6, 12] as const;

const istMonatsende = (d: IsoDatum) => monatsende(monatsNummer(d)) === d;

/** Termin Nummer n (auch negativ) ab dem ersten Test; Monatsenden bleiben Monatsenden. */
export function testTermin(ersterTest: IsoDatum, intervallMonate: number, n: number): IsoDatum {
  const d = plusMonate(ersterTest, n * intervallMonate);
  return istMonatsende(ersterTest) ? monatsende(monatsNummer(d)) : d;
}

/** Alle Testtermine im Zeitraum [von, bis]. */
export function testTermine(ersterTest: IsoDatum, intervallMonate: number, von: IsoDatum, bis: IsoDatum): IsoDatum[] {
  if (!Number.isInteger(intervallMonate) || intervallMonate < 1 || von > bis) return [];
  // Startindex knapp darunter schätzen, dann bis zum ersten Termin ab `von` weiterzählen.
  let n = Math.floor((monatsNummer(von) - monatsNummer(ersterTest)) / intervallMonate) - 1;
  while (testTermin(ersterTest, intervallMonate, n) < von) n++;
  const termine: IsoDatum[] = [];
  for (let d = testTermin(ersterTest, intervallMonate, n); d <= bis; d = testTermin(ersterTest, intervallMonate, ++n)) termine.push(d);
  return termine;
}

/** Letzter Testtermin bis einschließlich Stichtag oder null. */
export function letzterTesttermin(ersterTest: IsoDatum, intervallMonate: number, stichtag: IsoDatum): IsoDatum | null {
  if (ersterTest > stichtag) return null;
  const t = testTermine(ersterTest, intervallMonate, plusMonate(stichtag, -intervallMonate), stichtag);
  return t[t.length - 1] ?? null;
}

type Text = string;
type Zahl = string;

export interface NachweisInhalt {
  version: 1;
  stichtag: IsoDatum;
  erstelltAm: string;
  erstelltVon: string | null;
  mandant: Text;
  kredit: { bezeichnung: Text; bank: Text | null; kreditnummer: Text | null; gesellschaft: Text };
  haeuser: Array<{
    bezeichnung: Text;
    verkehrswert: { wert: Zahl; stichtag: IsoDatum; quelle: Text | null } | null;
    istJahr: Zahl;
  }>;
  kredite: Array<{
    bezeichnung: Text;
    eigener: boolean;
    anteile: Array<{ haus: Text; prozent: Zahl }>;
    restschuld: { betrag: Zahl; stichtag: IsoDatum; quelle: Text | null; quelleText: Text | null; herkunft: "saldo" | "buchung" | "nichtAusgezahlt" } | null;
    kapitaldienst: { zins: Zahl; tilgung: Zahl; quelle: "buchungen" | "schaetzung"; von: IsoDatum | null; bis: IsoDatum | null } | null;
  }>;
  summen: { verkehrswert: Zahl; restschuld: Zahl; istJahr: Zahl; kapitaldienstJahr: Zahl; zinsenJahr: Zahl };
  kennzahlen: { LTV: Zahl | null; DSCR: Zahl | null; ICR: Zahl | null };
  covenants: Array<{
    kennzahl: Text;
    folge: "COVENANT" | "AUSSCHUETTUNGSSPERRE";
    vergleich: "HOECHSTENS" | "MINDESTENS" | null;
    schwellenwert: Zahl | null;
    wert: Zahl | null;
    eingehalten: boolean | null;
    abstand: Zahl | null;
    beschreibung: Text | null;
  }>;
  luecken: Array<{ art: "verkehrswert" | "restschuld" | "kapitaldienst" | "geschaetzt" | "keinHaus"; objekt: Text }>;
}

export interface NachweisEingabe {
  stichtag: IsoDatum;
  erstelltAm: Date;
  erstelltVon: string | null;
  mandant: string;
  kredit: KreditDaten & { bank: string | null; kreditnummer: string | null; gesellschaft: string };
  haeuser: HausDaten[];
  alleKredite: KreditDaten[];
  referenzwerte: ReferenzWert[];
  covenants: Array<{ kennzahl: string; folge: "COVENANT" | "AUSSCHUETTUNGSSPERRE"; vergleich: "HOECHSTENS" | "MINDESTENS" | null; schwellenwert: Decimal | null; beschreibung: string | null }>;
  namen: { haus: Map<string, string>; kredit: Map<string, string> };
  verkehrswertQuelle: (hausId: string, stichtag: IsoDatum) => string | null;
}

const z = (d: Decimal | null | undefined): Zahl | null => (d == null ? null : d.toString());

export function erstelleNachweis(e: NachweisEingabe): NachweisInhalt {
  const { stichtag } = e;
  const ids = new Set(e.kredit.haeuser.map((x) => x.hausId));
  const haeuser = e.haeuser.filter((h) => ids.has(h.id));
  const kredite = e.alleKredite.filter((k) => k.haeuser.some((x) => ids.has(x.hausId)));
  const kz = covenantKennzahlen(e.kredit, e.haeuser, e.alleKredite, e.referenzwerte, stichtag);
  const luecken: NachweisInhalt["luecken"] = [];
  if (haeuser.length === 0) luecken.push({ art: "keinHaus", objekt: e.kredit.bezeichnung });

  const hausZeilen = haeuser.map((h) => {
    const name = e.namen.haus.get(h.id) ?? h.id;
    const s = hausSummen(h, stichtag);
    let vw: NachweisInhalt["haeuser"][number]["verkehrswert"] = null;
    for (const v of h.verkehrswerte) if (v.stichtag <= stichtag && (!vw || v.stichtag > vw.stichtag)) vw = { wert: v.wert.toString(), stichtag: v.stichtag, quelle: null };
    if (vw) vw.quelle = e.verkehrswertQuelle(h.id, vw.stichtag);
    else luecken.push({ art: "verkehrswert", objekt: name });
    return { bezeichnung: name, verkehrswert: vw, istJahr: s.istMonat.times(12).toString() };
  });

  const kreditZeilen = kredite.map((k) => {
    const name = e.namen.kredit.get(k.id) ?? k.bezeichnung;
    const rest = restschuldNachweis(k, stichtag);
    const kd = kapitaldienstJahr(k, e.referenzwerte, stichtag);
    if (!rest) luecken.push({ art: "restschuld", objekt: name });
    if (!kd) luecken.push({ art: "kapitaldienst", objekt: name });
    else if (kd.quelle === "schaetzung") luecken.push({ art: "geschaetzt", objekt: name });
    return {
      bezeichnung: name,
      eigener: k.id === e.kredit.id,
      anteile: k.haeuser.filter((x) => ids.has(x.hausId)).map((x) => ({ haus: e.namen.haus.get(x.hausId) ?? x.hausId, prozent: x.anteilProzent.toString() })),
      restschuld: rest ? { betrag: rest.betrag.toString(), stichtag: rest.stichtag, quelle: rest.quelle ?? null, quelleText: rest.quelleText, herkunft: rest.herkunft } : null,
      kapitaldienst: kd ? { zins: kd.zins.toString(), tilgung: kd.tilgung.toString(), quelle: kd.quelle, von: kd.von ?? null, bis: kd.bis ?? null } : null,
    };
  });

  const covenants = e.covenants.map((c) => {
    const p = pruefeCovenant(c, { LTV: kz.ltv, DSCR: kz.dscr, ICR: kz.icr });
    const puffer = covenantPuffer(c, kz);
    return {
      kennzahl: c.kennzahl,
      folge: c.folge,
      vergleich: c.vergleich,
      schwellenwert: z(c.schwellenwert),
      wert: z(p.wert),
      eingehalten: p.eingehalten,
      abstand: z(puffer?.abstand),
      beschreibung: c.beschreibung,
    };
  });

  return {
    version: 1,
    stichtag,
    erstelltAm: e.erstelltAm.toISOString(),
    erstelltVon: e.erstelltVon,
    mandant: e.mandant,
    kredit: { bezeichnung: e.kredit.bezeichnung, bank: e.kredit.bank, kreditnummer: e.kredit.kreditnummer, gesellschaft: e.kredit.gesellschaft },
    haeuser: hausZeilen,
    kredite: kreditZeilen,
    summen: {
      verkehrswert: kz.verkehrswert.toString(),
      restschuld: kz.restschuld.toString(),
      istJahr: kz.istJahr.toString(),
      kapitaldienstJahr: kz.kapitaldienstJahr.toString(),
      zinsenJahr: kz.zinsenJahr.toString(),
    },
    kennzahlen: { LTV: z(kz.ltv), DSCR: z(kz.dscr), ICR: z(kz.icr) },
    covenants,
    luecken,
  };
}

/** Gesamtergebnis: verletzt, sobald ein Covenant verletzt ist; offen, wenn einer nicht prüfbar ist. */
export function gesamtErgebnis(inhalt: Pick<NachweisInhalt, "covenants">): "eingehalten" | "verletzt" | "offen" {
  if (inhalt.covenants.some((c) => c.eingehalten === false)) return "verletzt";
  if (inhalt.covenants.length === 0 || inhalt.covenants.some((c) => c.eingehalten === null)) return "offen";
  return "eingehalten";
}

export const alsDezimal = (x: Zahl | null) => (x === null ? null : dezimal(x));
