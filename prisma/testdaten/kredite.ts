/**
 * Kredite der Testdaten: Vorgaben je Kredit, Durchrechnung (Zins, Tilgung, Restschuld)
 * und daraus Buchungen und Tilgungspläne.
 *
 * Die Kreditbeträge werden so bestimmt, dass die Restschuld am Stichtag den gewünschten
 * LTV je Haus ergibt. Da Restschuld und Ursprungsbetrag (fast) proportional sind, reicht
 * eine Probe-Durchrechnung mit 10 Mio. €.
 */
import { aufCent, dezimal, Decimal } from "../../src/lib/geld";
import {
  euribor,
  monatsanfang,
  monatsende,
  monatsNummer,
  plusJahre,
  testIban,
  type Referenzzins,
} from "./hilfen";

/** Letzter Tag mit Buchungen (Ende Oktober 2026). */
export const STICHTAG = "2026-10-31";
/** Erster Tag des 24-monatigen Buchungszeitraums. */
export const BUCHUNGEN_AB = "2024-11-01";

export type BankFormat = "A" | "B" | "C";

/** Frei erfundene Banken. Die Bankleitzahlen 9999xxxx gibt es in Deutschland nicht. */
export const BANKEN = {
  TN: { name: "Testbank Nord AG", kuerzel: "TN", bankleitzahl: "99990010", format: "A" },
  BH: { name: "Beispiel Hypothekenbank AG", kuerzel: "BH", bankleitzahl: "99990020", format: "B" },
  VB: { name: "Musterland Volksbank eG", kuerzel: "VB", bankleitzahl: "99990030", format: "C" },
  LB: { name: "Demo Landesbank", kuerzel: "LB", bankleitzahl: "99990040", format: "A" },
} as const satisfies Record<string, { name: string; kuerzel: string; bankleitzahl: string; format: BankFormat }>;

export type BankSchluessel = keyof typeof BANKEN;

interface KreditVorgabe {
  schluessel: string;
  gesellschaft: string;
  /** Ein Haus, oder zwei Häuser bei gemeinsamer Finanzierung. */
  haeuser: string[];
  /** Anteil an der Zielschuld des Hauses (ohne gemeinsamen Kredit) in Prozent; nur bei einem Haus. */
  anteil?: number;
  bank: BankSchluessel;
  bezeichnung: string;
  auszahlung: string;
  zahlweise: "MONATLICH" | "QUARTALSWEISE";
  /** Anfängliche Tilgung in Prozent p. a. */
  tilgung: string;
  fest?: { sollzins: string; bindungJahre: number };
  variabel?: { referenz: Referenzzins; marge: string; laufzeitJahre: number };
  nachverhandlung?: { ab: string; sollzins: string; tilgung: string; bindungJahre: number };
  sondertilgung?: { datum: string; prozentVomSaldo: number };
  covenants?: { kennzahl: string; vergleich: "HOECHSTENS" | "MINDESTENS"; schwellenwert: string; pruefrhythmus: string }[];
}

/**
 * 25 Kredite für 15 Häuser. Besonderheiten:
 * - K04 finanziert die Häuser H02 und H03 gemeinsam (Aufteilung nach Kaufpreis).
 * - K05: Zinsbindung lief am 30.06.2025 aus, Anschlussfinanzierung nach Nachverhandlung
 *   (Tilgungsplan Version 2).
 * - K14: Sondertilgung am 31.12.2025, danach neuer Tilgungsplan (Version 2).
 * - K09 (30.11.2026), K01, K14, K18, K19, K08, K22: Zinsbindung endet in den nächsten 2 Jahren.
 * - K12: LTV-Covenant 65 %, das Haus liegt darüber (Covenant-Verletzung zum Testen).
 */
export const KREDIT_VORGABEN: KreditVorgabe[] = [
  { schluessel: "K01", gesellschaft: "G1", haeuser: ["H01"], anteil: 70, bank: "TN", bezeichnung: "Annuitätendarlehen Ankauf",
    auszahlung: "2017-03-15", zahlweise: "MONATLICH", tilgung: "2.50", fest: { sollzins: "1.48", bindungJahre: 10 } },
  { schluessel: "K02", gesellschaft: "G1", haeuser: ["H01"], anteil: 30, bank: "VB", bezeichnung: "Modernisierungsdarlehen variabel",
    auszahlung: "2021-06-01", zahlweise: "MONATLICH", tilgung: "3.00", variabel: { referenz: "3M-EURIBOR", marge: "1.65", laufzeitJahre: 10 } },
  { schluessel: "K03", gesellschaft: "G1", haeuser: ["H02"], anteil: 100, bank: "BH", bezeichnung: "Annuitätendarlehen Ankauf",
    auszahlung: "2019-07-01", zahlweise: "MONATLICH", tilgung: "2.00", fest: { sollzins: "1.12", bindungJahre: 15 },
    covenants: [{ kennzahl: "LTV", vergleich: "HOECHSTENS", schwellenwert: "70", pruefrhythmus: "jährlich zum 31.12." }] },
  { schluessel: "K04", gesellschaft: "G1", haeuser: ["H02", "H03"], bank: "TN", bezeichnung: "Gesamtgrundschuld-Darlehen Spreeufer/Kastanienhof",
    auszahlung: "2019-07-01", zahlweise: "MONATLICH", tilgung: "2.00", fest: { sollzins: "1.35", bindungJahre: 10 } },
  { schluessel: "K05", gesellschaft: "G1", haeuser: ["H03"], anteil: 100, bank: "LB", bezeichnung: "Annuitätendarlehen Ankauf",
    auszahlung: "2015-07-01", zahlweise: "MONATLICH", tilgung: "2.00", fest: { sollzins: "1.95", bindungJahre: 10 },
    nachverhandlung: { ab: "2025-07-01", sollzins: "3.45", tilgung: "3.00", bindungJahre: 5 } },
  { schluessel: "K06", gesellschaft: "G2", haeuser: ["H04"], anteil: 100, bank: "BH", bezeichnung: "Variables Darlehen 6M",
    auszahlung: "2018-05-02", zahlweise: "QUARTALSWEISE", tilgung: "2.00", variabel: { referenz: "6M-EURIBOR", marge: "1.40", laufzeitJahre: 10 },
    covenants: [{ kennzahl: "DSCR", vergleich: "MINDESTENS", schwellenwert: "1.20", pruefrhythmus: "jährlich zum 31.12." }] },
  { schluessel: "K07", gesellschaft: "G2", haeuser: ["H05"], anteil: 60, bank: "VB", bezeichnung: "Annuitätendarlehen Ankauf",
    auszahlung: "2021-02-01", zahlweise: "MONATLICH", tilgung: "2.00", fest: { sollzins: "1.15", bindungJahre: 10 } },
  { schluessel: "K08", gesellschaft: "G2", haeuser: ["H05"], anteil: 40, bank: "TN", bezeichnung: "Nachfinanzierung Dachausbau",
    auszahlung: "2023-09-01", zahlweise: "MONATLICH", tilgung: "2.50", fest: { sollzins: "4.05", bindungJahre: 5 } },
  { schluessel: "K09", gesellschaft: "G2", haeuser: ["H06"], anteil: 50, bank: "LB", bezeichnung: "Annuitätendarlehen Ankauf",
    auszahlung: "2016-12-01", zahlweise: "MONATLICH", tilgung: "2.00", fest: { sollzins: "1.62", bindungJahre: 10 } },
  { schluessel: "K10", gesellschaft: "G2", haeuser: ["H06"], anteil: 20, bank: "TN", bezeichnung: "Variables Darlehen 3M",
    auszahlung: "2020-03-01", zahlweise: "MONATLICH", tilgung: "2.50", variabel: { referenz: "3M-EURIBOR", marge: "1.55", laufzeitJahre: 8 } },
  { schluessel: "K11", gesellschaft: "G2", haeuser: ["H06"], anteil: 30, bank: "BH", bezeichnung: "Annuitätendarlehen Gewerbeumbau",
    auszahlung: "2024-04-01", zahlweise: "MONATLICH", tilgung: "2.00", fest: { sollzins: "3.70", bindungJahre: 10 } },
  { schluessel: "K12", gesellschaft: "G3", haeuser: ["H07"], anteil: 65, bank: "BH", bezeichnung: "Annuitätendarlehen Ankauf",
    auszahlung: "2020-04-01", zahlweise: "MONATLICH", tilgung: "2.00", fest: { sollzins: "0.95", bindungJahre: 10 },
    covenants: [{ kennzahl: "LTV", vergleich: "HOECHSTENS", schwellenwert: "65", pruefrhythmus: "halbjährlich" }] },
  { schluessel: "K13", gesellschaft: "G3", haeuser: ["H07"], anteil: 35, bank: "VB", bezeichnung: "Variables Darlehen 6M",
    auszahlung: "2022-10-01", zahlweise: "MONATLICH", tilgung: "2.00", variabel: { referenz: "6M-EURIBOR", marge: "1.85", laufzeitJahre: 10 } },
  { schluessel: "K14", gesellschaft: "G3", haeuser: ["H08"], anteil: 100, bank: "LB", bezeichnung: "Annuitätendarlehen Ankauf",
    auszahlung: "2015-06-15", zahlweise: "MONATLICH", tilgung: "2.50", fest: { sollzins: "1.60", bindungJahre: 12 },
    sondertilgung: { datum: "2025-12-31", prozentVomSaldo: 8 } },
  { schluessel: "K15", gesellschaft: "G3", haeuser: ["H09"], anteil: 100, bank: "VB", bezeichnung: "Annuitätendarlehen Ankauf",
    auszahlung: "2022-08-01", zahlweise: "MONATLICH", tilgung: "2.00", fest: { sollzins: "3.10", bindungJahre: 10 } },
  { schluessel: "K16", gesellschaft: "G4", haeuser: ["H10"], anteil: 50, bank: "TN", bezeichnung: "Annuitätendarlehen Ankauf",
    auszahlung: "2019-01-15", zahlweise: "QUARTALSWEISE", tilgung: "2.00", fest: { sollzins: "1.40", bindungJahre: 15 } },
  { schluessel: "K17", gesellschaft: "G4", haeuser: ["H10"], anteil: 20, bank: "LB", bezeichnung: "Variables Darlehen 3M",
    auszahlung: "2023-06-01", zahlweise: "MONATLICH", tilgung: "3.00", variabel: { referenz: "3M-EURIBOR", marge: "1.75", laufzeitJahre: 5 } },
  { schluessel: "K18", gesellschaft: "G4", haeuser: ["H10"], anteil: 30, bank: "BH", bezeichnung: "Annuitätendarlehen Nachfinanzierung",
    auszahlung: "2021-01-15", zahlweise: "MONATLICH", tilgung: "2.50", fest: { sollzins: "0.98", bindungJahre: 7 } },
  { schluessel: "K19", gesellschaft: "G4", haeuser: ["H11"], anteil: 100, bank: "LB", bezeichnung: "Annuitätendarlehen Ankauf",
    auszahlung: "2017-11-01", zahlweise: "MONATLICH", tilgung: "2.00", fest: { sollzins: "1.55", bindungJahre: 10 } },
  { schluessel: "K20", gesellschaft: "G4", haeuser: ["H12"], anteil: 70, bank: "VB", bezeichnung: "Annuitätendarlehen Ankauf",
    auszahlung: "2023-03-01", zahlweise: "MONATLICH", tilgung: "1.50", fest: { sollzins: "3.85", bindungJahre: 10 },
    covenants: [{ kennzahl: "DSCR", vergleich: "MINDESTENS", schwellenwert: "1.25", pruefrhythmus: "jährlich zum 31.12." }] },
  { schluessel: "K21", gesellschaft: "G4", haeuser: ["H12"], anteil: 30, bank: "TN", bezeichnung: "Variables Darlehen 6M",
    auszahlung: "2023-03-01", zahlweise: "MONATLICH", tilgung: "2.00", variabel: { referenz: "6M-EURIBOR", marge: "1.60", laufzeitJahre: 7 } },
  { schluessel: "K22", gesellschaft: "G5", haeuser: ["H13"], anteil: 100, bank: "BH", bezeichnung: "Annuitätendarlehen Ankauf",
    auszahlung: "2018-10-01", zahlweise: "MONATLICH", tilgung: "2.00", fest: { sollzins: "1.70", bindungJahre: 10 } },
  { schluessel: "K23", gesellschaft: "G5", haeuser: ["H14"], anteil: 45, bank: "LB", bezeichnung: "Variables Darlehen 6M",
    auszahlung: "2016-02-01", zahlweise: "MONATLICH", tilgung: "2.00", variabel: { referenz: "6M-EURIBOR", marge: "1.50", laufzeitJahre: 12 } },
  { schluessel: "K24", gesellschaft: "G5", haeuser: ["H14"], anteil: 55, bank: "TN", bezeichnung: "Annuitätendarlehen Refinanzierung",
    auszahlung: "2024-10-01", zahlweise: "MONATLICH", tilgung: "2.00", fest: { sollzins: "3.60", bindungJahre: 10 } },
  { schluessel: "K25", gesellschaft: "G5", haeuser: ["H15"], anteil: 100, bank: "VB", bezeichnung: "Annuitätendarlehen Ankauf",
    auszahlung: "2021-09-01", zahlweise: "MONATLICH", tilgung: "2.00", fest: { sollzins: "1.05", bindungJahre: 10 } },
];

// ---------------------------------------------------------------------------
// Durchrechnung
// ---------------------------------------------------------------------------

export interface Periode {
  datum: string;
  zinssatz: Decimal;
  zins: Decimal;
  tilgung: Decimal;
  restschuld: Decimal;
  sondertilgung?: Decimal;
}

function durchrechnen(v: KreditVorgabe, ursprung: Decimal, bisMonat: number, mitAenderungen: boolean): Periode[] {
  const perioden: Periode[] = [];
  const quartal = v.zahlweise === "QUARTALSWEISE";
  const proJahr = quartal ? 4 : 12;
  const start = monatsNummer(v.auszahlung);
  let monat = start + 1;
  if (quartal) while (monat % 3 !== 2) monat++;

  let saldo = ursprung;
  let sollzins = v.fest ? dezimal(v.fest.sollzins) : null;
  let rate = v.fest ? aufCent(ursprung.times(sollzins!.plus(v.tilgung)).dividedBy(100 * proJahr)) : null;
  const festeTilgung = aufCent(ursprung.times(v.tilgung).dividedBy(100 * proJahr));
  const anpassungAlle = v.variabel?.referenz === "6M-EURIBOR" ? 6 : 3;
  let nachverhandelt = false;

  for (; monat <= bisMonat && saldo.greaterThan(0); monat += quartal ? 3 : 1) {
    const nv = v.nachverhandlung;
    if (mitAenderungen && nv && !nachverhandelt && monat >= monatsNummer(nv.ab)) {
      nachverhandelt = true;
      sollzins = dezimal(nv.sollzins);
      rate = aufCent(saldo.times(sollzins.plus(nv.tilgung)).dividedBy(100 * proJahr));
    }
    let zinssatz: Decimal;
    if (v.variabel) {
      const anpassung = start + Math.floor((monat - start) / anpassungAlle) * anpassungAlle;
      zinssatz = Decimal.max(euribor(v.variabel.referenz, anpassung), 0).plus(v.variabel.marge);
    } else {
      zinssatz = sollzins!;
    }
    const zins = aufCent(saldo.times(zinssatz).dividedBy(100 * proJahr));
    let tilgung = v.variabel ? festeTilgung : rate!.minus(zins);
    if (tilgung.greaterThan(saldo)) tilgung = saldo;
    saldo = saldo.minus(tilgung);
    const periode: Periode = { datum: monatsende(monat), zinssatz, zins, tilgung, restschuld: saldo };

    const st = v.sondertilgung;
    if (mitAenderungen && st && monatsende(monat) === st.datum) {
      const betrag = aufTausend(saldo.times(st.prozentVomSaldo).dividedBy(100), Decimal.ROUND_DOWN);
      saldo = saldo.minus(betrag);
      periode.sondertilgung = betrag;
      periode.restschuld = saldo;
    }
    perioden.push(periode);
  }
  return perioden;
}

export function aufTausend(wert: Decimal, rundung: Decimal.Rounding): Decimal {
  return wert.dividedBy(1000).toDecimalPlaces(0, rundung).times(1000);
}

function restschuldAm(perioden: Periode[], ursprung: Decimal, datum: string): Decimal {
  let saldo = ursprung;
  for (const p of perioden) if (p.datum <= datum) saldo = p.restschuld;
  return saldo;
}

// ---------------------------------------------------------------------------
// Ergebnis
// ---------------------------------------------------------------------------

export type BuchungsArt = "ZINS" | "TILGUNG" | "SONDERTILGUNG";

export interface TestBuchung {
  datum: string;
  art: BuchungsArt;
  betrag: Decimal;
  saldoNach: Decimal;
  /** Zinssatz der Periode in Prozent p. a. (nicht in der Datenbank, nur für das CSV-Format C) */
  zinssatz: Decimal;
}

export interface TestTilgungsplan {
  version: number;
  gueltigAb: string;
  bezeichnung: string;
  zeilen: { faelligAm: string; zins: Decimal; tilgung: Decimal; rate: Decimal; restschuld: Decimal }[];
}

export interface TestKredit {
  schluessel: string;
  gesellschaft: string;
  bezeichnung: string;
  bank: BankSchluessel;
  kreditnummer: string;
  iban: string;
  ursprungsbetrag: Decimal;
  auszahlungsdatum: string;
  zinsArt: "FEST" | "VARIABEL";
  sollzins: Decimal | null;
  referenzzins: Referenzzins | null;
  marge: Decimal | null;
  zinsbindungBis: string | null;
  laufzeitBis: string | null;
  zahlweise: "MONATLICH" | "QUARTALSWEISE";
  tilgungsart: "ANNUITAET" | "RATENTILGUNG";
  /** Tilgung in Prozent p. a. (nach Nachverhandlung die neue) */
  anfaenglicheTilgung: Decimal;
  /** Annuität: Rate je Zahlung am Stichtag; Ratentilgung: Tilgungsbetrag je Zahlung */
  ratenbetrag: Decimal;
  notiz: string | null;
  haeuser: { haus: string; anteilProzent: Decimal }[];
  restschuldStichtag: Decimal;
  saldoVorZeitraum: Decimal;
  buchungen: TestBuchung[];
  tilgungsplaene: TestTilgungsplan[];
  covenants: NonNullable<KreditVorgabe["covenants"]>;
}

const PROBE = dezimal(10_000_000);

/**
 * Baut alle Kredite. `zielSchuld` ist die gewünschte Restschuld je Haus am Stichtag
 * (Verkehrswert × LTV), `kaufpreis` dient der Aufteilung gemeinsamer Kredite.
 */
export function baueKredite(zielSchuld: Map<string, Decimal>, kaufpreis: Map<string, Decimal>): TestKredit[] {
  // 1. Gemeinsame Kredite: Anteile nach Kaufpreis, Zielrestschuld = 50 % der Zielschuld beider Häuser.
  const restZiel = new Map(zielSchuld);
  const ziel = new Map<string, Decimal>();
  const anteile = new Map<string, { haus: string; anteilProzent: Decimal }[]>();
  for (const v of KREDIT_VORGABEN) {
    if (v.haeuser.length === 1) {
      anteile.set(v.schluessel, [{ haus: v.haeuser[0], anteilProzent: dezimal(100) }]);
      continue;
    }
    const [a, b] = v.haeuser;
    const summe = kaufpreis.get(a)!.plus(kaufpreis.get(b)!);
    const anteilA = kaufpreis.get(a)!.dividedBy(summe).times(100).toDecimalPlaces(6);
    const anteilB = dezimal(100).minus(anteilA);
    const gesamt = zielSchuld.get(a)!.plus(zielSchuld.get(b)!).dividedBy(2);
    ziel.set(v.schluessel, gesamt);
    anteile.set(v.schluessel, [
      { haus: a, anteilProzent: anteilA },
      { haus: b, anteilProzent: anteilB },
    ]);
    restZiel.set(a, restZiel.get(a)!.minus(gesamt.times(anteilA).dividedBy(100)));
    restZiel.set(b, restZiel.get(b)!.minus(gesamt.times(anteilB).dividedBy(100)));
  }
  // 2. Einzelkredite: Anteil an der verbleibenden Zielschuld des Hauses.
  for (const v of KREDIT_VORGABEN) {
    if (v.haeuser.length === 1) ziel.set(v.schluessel, restZiel.get(v.haeuser[0])!.times(v.anteil!).dividedBy(100));
  }

  const stichtagMonat = monatsNummer(STICHTAG);
  const nummern = new Map<string, number>();

  return KREDIT_VORGABEN.map((v) => {
    // 3. Ursprungsbetrag so wählen, dass die Restschuld am Stichtag dem Ziel entspricht.
    const probe = durchrechnen(v, PROBE, stichtagMonat, true);
    const verhaeltnis = restschuldAm(probe, PROBE, STICHTAG).dividedBy(PROBE);
    const ursprung = aufTausend(ziel.get(v.schluessel)!.dividedBy(verhaeltnis), Decimal.ROUND_HALF_UP);

    const bindungsEnde = v.fest ? plusJahre(v.auszahlung, v.fest.bindungJahre) : null;
    const neueBindung = v.nachverhandlung ? plusJahre(v.nachverhandlung.ab, v.nachverhandlung.bindungJahre) : null;
    const zinsbindungBis = neueBindung ?? bindungsEnde;
    const laufzeitBis = v.variabel ? plusJahre(v.auszahlung, v.variabel.laufzeitJahre) : null;
    const rechnenBis = Math.max(stichtagMonat, zinsbindungBis ? monatsNummer(zinsbindungBis) : 0);
    const perioden = durchrechnen(v, ursprung, rechnenBis, true);

    // Buchungen im Zeitraum: je Zahlung eine Zins- und eine Tilgungsabbuchung.
    const buchungen: TestBuchung[] = [];
    let saldoVorher = ursprung;
    let saldoVorZeitraum = ursprung;
    for (const p of perioden) {
      if (p.datum < BUCHUNGEN_AB) saldoVorZeitraum = p.restschuld;
      if (p.datum >= BUCHUNGEN_AB && p.datum <= STICHTAG) {
        const nachTilgung = saldoVorher.minus(p.tilgung);
        buchungen.push({ datum: p.datum, art: "ZINS", betrag: p.zins, saldoNach: saldoVorher, zinssatz: p.zinssatz });
        buchungen.push({ datum: p.datum, art: "TILGUNG", betrag: p.tilgung, saldoNach: nachTilgung, zinssatz: p.zinssatz });
        if (p.sondertilgung) {
          buchungen.push({ datum: p.datum, art: "SONDERTILGUNG", betrag: p.sondertilgung, saldoNach: p.restschuld, zinssatz: p.zinssatz });
        }
      }
      saldoVorher = p.restschuld;
    }

    // Tilgungspläne (nur bei Festzins): Version 1 ab Auszahlung bis Ende der ersten Zinsbindung.
    const tilgungsplaene: TestTilgungsplan[] = [];
    const zeile = (p: Periode) => ({
      faelligAm: p.datum, zins: p.zins, tilgung: p.tilgung, rate: p.zins.plus(p.tilgung), restschuld: p.restschuld,
    });
    if (bindungsEnde) {
      const ursprungsplan = durchrechnen(v, ursprung, monatsNummer(bindungsEnde), false);
      tilgungsplaene.push({ version: 1, gueltigAb: v.auszahlung, bezeichnung: "Ursprungsplan", zeilen: ursprungsplan.map(zeile) });
    }
    if (v.nachverhandlung) {
      const ab = v.nachverhandlung.ab;
      tilgungsplaene.push({
        version: 2, gueltigAb: ab, bezeichnung: "Anschlussfinanzierung nach Nachverhandlung",
        zeilen: perioden.filter((p) => p.datum >= ab).map(zeile),
      });
    }
    if (v.sondertilgung && bindungsEnde) {
      const ab = monatsanfang(monatsNummer(v.sondertilgung.datum) + 1);
      tilgungsplaene.push({
        version: 2, gueltigAb: ab, bezeichnung: "Neuer Tilgungsplan nach Sondertilgung",
        zeilen: perioden.filter((p) => p.datum >= ab && monatsNummer(p.datum) <= monatsNummer(bindungsEnde)).map(zeile),
      });
    }

    const bank = BANKEN[v.bank];
    const nr = (nummern.get(v.bank) ?? 0) + 1;
    nummern.set(v.bank, nr);
    const jahr = v.auszahlung.slice(0, 4);
    const kreditnummer = `${bank.kuerzel}-${jahr}-${String(400 + nr * 17).padStart(5, "0")}`;
    const konto = `${jahr}${String(400 + nr * 17).padStart(6, "0")}`;

    let notiz: string | null = null;
    if (v.nachverhandlung) {
      notiz = `Zinsbindung (${v.fest!.sollzins} %) endete am ${bindungsEnde}. Anschlussfinanzierung nach Nachverhandlung ab ${v.nachverhandlung.ab} mit ${v.nachverhandlung.sollzins} % und ${v.nachverhandlung.tilgung} % Tilgung.`;
    } else if (v.sondertilgung) {
      notiz = `Sondertilgung am ${v.sondertilgung.datum}, danach neuer Tilgungsplan bei gleicher Rate.`;
    } else if (v.variabel) {
      notiz = `Zinsanpassung alle ${v.variabel.referenz === "6M-EURIBOR" ? 6 : 3} Monate, Zinsfloor: Referenzzins mindestens 0 %.`;
    } else if (v.haeuser.length > 1) {
      notiz = "Gesamtgrundschuld auf beiden Häusern, Aufteilung nach Kaufpreisverhältnis.";
    }

    const letzte = [...perioden].reverse().find((p) => p.datum <= STICHTAG)!;
    const ratenbetrag = v.variabel ? aufCent(ursprung.times(v.tilgung).dividedBy(100 * (v.zahlweise === "QUARTALSWEISE" ? 4 : 12))) : letzte.zins.plus(letzte.tilgung);

    return {
      schluessel: v.schluessel,
      gesellschaft: v.gesellschaft,
      bezeichnung: v.bezeichnung,
      bank: v.bank,
      kreditnummer,
      iban: testIban(bank.bankleitzahl, konto),
      ursprungsbetrag: ursprung,
      auszahlungsdatum: v.auszahlung,
      zinsArt: v.fest ? "FEST" : "VARIABEL",
      sollzins: v.nachverhandlung ? dezimal(v.nachverhandlung.sollzins) : v.fest ? dezimal(v.fest.sollzins) : null,
      referenzzins: v.variabel?.referenz ?? null,
      marge: v.variabel ? dezimal(v.variabel.marge) : null,
      zinsbindungBis,
      laufzeitBis,
      zahlweise: v.zahlweise,
      tilgungsart: v.variabel ? "RATENTILGUNG" : "ANNUITAET",
      anfaenglicheTilgung: dezimal(v.nachverhandlung?.tilgung ?? v.tilgung),
      ratenbetrag,
      notiz,
      haeuser: anteile.get(v.schluessel)!,
      restschuldStichtag: restschuldAm(perioden, ursprung, STICHTAG),
      saldoVorZeitraum,
      buchungen,
      tilgungsplaene,
      covenants: v.covenants ?? [],
    };
  });
}
