/**
 * Realistischer, frei erfundener Testdatensatz: 5 Gesellschaften, 15 Häuser, Einheiten,
 * Mieter, Kredite mit 24 Monaten Buchungen. Reproduzierbar: gleicher Code = gleiche Daten.
 *
 * Herleitung (siehe testdaten/README.md):
 * - Verkehrswerte 8,0 bis 20,0 Mio. €, Kaufpreis 5 bis 12 % darunter.
 * - Jahres-Soll-Nettokaltmiete der vermieteten Einheiten = Kaufpreis / Kaufpreisfaktor (18 bis 25).
 * - Fläche aus der Miete und dem örtlichen Mietniveau, daraus 30 bis 80 Einheiten.
 * - Restschuld am Stichtag = Verkehrswert × Ziel-LTV (50 bis 70 %).
 */
import { aufCent, dezimal, type Decimal } from "../../src/lib/geld";
import { zufall, type Zufall } from "./hilfen";
import { baueKredite, STICHTAG, type TestKredit } from "./kredite";

export { STICHTAG, BUCHUNGEN_AB, BANKEN } from "./kredite";

// ---------------------------------------------------------------------------
// Vorgaben
// ---------------------------------------------------------------------------

export interface TestGesellschaft {
  schluessel: string;
  name: string;
  rechtsform: string;
  registernummer: string;
  steuernummer: string;
}

export const GESELLSCHAFTEN: readonly TestGesellschaft[] = [
  { schluessel: "G1", name: "Lindenhof Wohnen GmbH & Co. KG", rechtsform: "GmbH & Co. KG", registernummer: "HRA 990011 B (Testwert)", steuernummer: "99/999/00011" },
  { schluessel: "G2", name: "Rheinblick Immobilien GmbH", rechtsform: "GmbH", registernummer: "HRB 990022 (Testwert)", steuernummer: "999/9999/0022" },
  { schluessel: "G3", name: "Elbufer Grundbesitz GmbH & Co. KG", rechtsform: "GmbH & Co. KG", registernummer: "HRA 990033 (Testwert)", steuernummer: "99/999/00033" },
  { schluessel: "G4", name: "Isartal Wohnbau GmbH", rechtsform: "GmbH", registernummer: "HRB 990044 (Testwert)", steuernummer: "999/999/90044" },
  { schluessel: "G5", name: "Mainhaus Bestand GmbH", rechtsform: "GmbH", registernummer: "HRB 990055 (Testwert)", steuernummer: "099 999 00055" },
];

interface HausVorgabe {
  schluessel: string;
  gesellschaft: string;
  strasse: string;
  plz: string;
  ort: string;
  /** Aktueller Verkehrswert in 100.000 € (123 = 12,3 Mio. €) */
  verkehrswert: number;
  /** Abschlag Kaufpreis gegenüber Verkehrswert in Prozent */
  kaufabschlag: number;
  kaufdatum: string;
  /** Örtliches Mietniveau Wohnen in Cent pro m² und Monat */
  mietniveau: number;
  /** Kaufpreisfaktor × 10 (235 = 23,5) */
  faktor: number;
  /** Ziel-Leerstand nach Fläche in Prozent (0 = voll vermietet) */
  leerstand: number;
  gewerbe: number;
  /** Ziel-LTV in Prozent */
  ltv: number;
}

/** Verkehrswerte gleichmäßig von 8,0 bis 20,0 Mio. € verteilt (Schritte von ca. 0,86 Mio. €). */
export const HAUS_VORGABEN: HausVorgabe[] = [
  { schluessel: "H01", gesellschaft: "G1", strasse: "Lindenhofstraße 12", plz: "10969", ort: "Berlin", verkehrswert: 123, kaufabschlag: 8, kaufdatum: "2017-03-15", mietniveau: 1350, faktor: 240, leerstand: 0, gewerbe: 0, ltv: 62 },
  { schluessel: "H02", gesellschaft: "G1", strasse: "Spreeuferpromenade 41", plz: "10245", ort: "Berlin", verkehrswert: 166, kaufabschlag: 10, kaufdatum: "2019-07-01", mietniveau: 1420, faktor: 235, leerstand: 8, gewerbe: 2, ltv: 58 },
  { schluessel: "H03", gesellschaft: "G1", strasse: "Am Kastanienhof 3", plz: "13353", ort: "Berlin", verkehrswert: 89, kaufabschlag: 12, kaufdatum: "2015-07-01", mietniveau: 1150, faktor: 210, leerstand: 0, gewerbe: 0, ltv: 65 },
  { schluessel: "H04", gesellschaft: "G2", strasse: "Rheinuferweg 18", plz: "50668", ort: "Köln", verkehrswert: 140, kaufabschlag: 9, kaufdatum: "2018-05-02", mietniveau: 1380, faktor: 225, leerstand: 0, gewerbe: 1, ltv: 53 },
  { schluessel: "H05", gesellschaft: "G2", strasse: "Am Römerturm 6a", plz: "50667", ort: "Köln", verkehrswert: 106, kaufabschlag: 6, kaufdatum: "2021-02-01", mietniveau: 1290, faktor: 230, leerstand: 10, gewerbe: 0, ltv: 68 },
  { schluessel: "H06", gesellschaft: "G2", strasse: "Schadowhof 22", plz: "40212", ort: "Düsseldorf", verkehrswert: 183, kaufabschlag: 11, kaufdatum: "2016-09-01", mietniveau: 1480, faktor: 240, leerstand: 0, gewerbe: 3, ltv: 60 },
  { schluessel: "H07", gesellschaft: "G3", strasse: "Hafenkante 9", plz: "20457", ort: "Hamburg", verkehrswert: 191, kaufabschlag: 7, kaufdatum: "2020-04-01", mietniveau: 1520, faktor: 245, leerstand: 6, gewerbe: 0, ltv: 66 },
  { schluessel: "H08", gesellschaft: "G3", strasse: "Alsterblick 27", plz: "22085", ort: "Hamburg", verkehrswert: 131, kaufabschlag: 12, kaufdatum: "2015-06-15", mietniveau: 1460, faktor: 220, leerstand: 0, gewerbe: 0, ltv: 54 },
  { schluessel: "H09", gesellschaft: "G3", strasse: "Elbwiesenweg 5", plz: "01069", ort: "Dresden", verkehrswert: 80, kaufabschlag: 6, kaufdatum: "2022-08-01", mietniveau: 920, faktor: 190, leerstand: 11, gewerbe: 0, ltv: 67 },
  { schluessel: "H10", gesellschaft: "G4", strasse: "Isarauen 14", plz: "81541", ort: "München", verkehrswert: 200, kaufabschlag: 8, kaufdatum: "2019-01-15", mietniveau: 2050, faktor: 248, leerstand: 0, gewerbe: 1, ltv: 56 },
  { schluessel: "H11", gesellschaft: "G4", strasse: "Lechuferstraße 31", plz: "86150", ort: "Augsburg", verkehrswert: 97, kaufabschlag: 10, kaufdatum: "2017-11-01", mietniveau: 1210, faktor: 215, leerstand: 7, gewerbe: 0, ltv: 61 },
  { schluessel: "H12", gesellschaft: "G4", strasse: "Nymphenhof 8", plz: "80639", ort: "München", verkehrswert: 157, kaufabschlag: 5, kaufdatum: "2023-03-01", mietniveau: 1960, faktor: 240, leerstand: 9, gewerbe: 2, ltv: 64 },
  { schluessel: "H13", gesellschaft: "G5", strasse: "Mainblick 20", plz: "60311", ort: "Frankfurt am Main", verkehrswert: 174, kaufabschlag: 9, kaufdatum: "2018-10-01", mietniveau: 1620, faktor: 230, leerstand: 0, gewerbe: 0, ltv: 55 },
  { schluessel: "H14", gesellschaft: "G5", strasse: "Am Auenwald 3", plz: "04109", ort: "Leipzig", verkehrswert: 114, kaufabschlag: 8, kaufdatum: "2016-02-01", mietniveau: 1010, faktor: 195, leerstand: 10, gewerbe: 0, ltv: 63 },
  { schluessel: "H15", gesellschaft: "G5", strasse: "Messehof 11", plz: "04103", ort: "Leipzig", verkehrswert: 149, kaufabschlag: 7, kaufdatum: "2021-09-01", mietniveau: 1060, faktor: 205, leerstand: 0, gewerbe: 0, ltv: 59 },
];

const VORNAMEN = [
  "Anna", "Lukas", "Marie", "Jonas", "Sophie", "Felix", "Laura", "Paul", "Lea", "Tim", "Hannah", "Leon",
  "Julia", "Ben", "Emma", "Elias", "Mia", "Noah", "Lena", "Finn", "Clara", "Moritz", "Sarah", "David",
  "Katharina", "Tobias", "Nina", "Simon", "Johanna", "Matthias", "Petra", "Thomas", "Sabine", "Michael",
  "Ayşe", "Mehmet", "Olga", "Piotr", "Giulia", "Marco", "Fatima", "Ali", "Jana", "Henrik", "Ida", "Karl",
];
const NACHNAMEN = [
  "Müller", "Schmidt", "Schneider", "Fischer", "Weber", "Meyer", "Wagner", "Becker", "Schulz", "Hoffmann",
  "Koch", "Bauer", "Richter", "Klein", "Wolf", "Schröder", "Neumann", "Schwarz", "Zimmermann", "Braun",
  "Krüger", "Hartmann", "Lange", "Schmitt", "Werner", "Krause", "Lehmann", "Yılmaz", "Kowalski", "Rossi",
  "Nowak", "Petrov", "Haddad", "Brandt", "Vogel", "Seidel", "Engel", "Frank", "Albrecht", "Kuhn",
];
const AELTERE_VORNAMEN = ["Ursula", "Klaus", "Monika", "Jürgen", "Gisela", "Horst", "Renate", "Dieter", "Helga", "Günter", "Ingrid", "Manfred"];
const FIRMEN = [
  "Bäckerei Sonnenkorn GmbH", "Physiopraxis Rückenwind", "Café Ufergold UG (haftungsbeschränkt)", "Blumen Lindgrün e. K.",
  "Zahnarztpraxis Dr. Feldhaus-Ober", "Kanzlei Bergmann & Partner mbB", "Kita Zwergenwiese gGmbH", "Optik Klarblick GmbH",
  "Yoga-Atelier Ostwind", "Weinhandlung Rebenhof GmbH", "Steuerbüro Zahlenwerk", "Fahrradwerkstatt Speichenglück UG",
  "Friseursalon Scherenschnitt", "Feinkost Olivenhain GmbH",
];
const POSITIONEN = ["links", "rechts", "Mitte", "Mitte links", "Mitte rechts", "hinten"];
const MINDERUNGSGRUENDE = ["Feuchtigkeitsschaden im Bad", "Heizungsausfall", "Baulärm Nachbargrundstück", "defekter Aufzug"];
const INVESTITIONEN = [
  { kategorie: "Dach", beschreibung: "Dachsanierung mit Dämmung", min: 180_000, max: 420_000 },
  { kategorie: "Heizung", beschreibung: "Austausch Gaskessel gegen Wärmepumpe", min: 90_000, max: 260_000 },
  { kategorie: "Fenster", beschreibung: "Austausch Fenster Straßenseite", min: 60_000, max: 150_000 },
  { kategorie: "Fassade", beschreibung: "Fassadenanstrich und Ausbesserung", min: 40_000, max: 120_000 },
  { kategorie: "Modernisierung Wohnung", beschreibung: "Bad und Böden nach Mieterwechsel", min: 18_000, max: 45_000 },
  { kategorie: "Aufzug", beschreibung: "Modernisierung Aufzugsanlage", min: 70_000, max: 140_000 },
];

// ---------------------------------------------------------------------------
// Ergebnis-Typen
// ---------------------------------------------------------------------------

export interface TestMietverhaeltnis {
  mieter: { name: string; istFirma: boolean };
  beginn: string;
  ende: string | null;
  istMiete: Decimal;
  sollMiete: Decimal;
  letzteMieterhoehung: string | null;
  rueckstand: Decimal;
  rueckstandStichtag: string | null;
  notiz: string | null;
}

export interface TestEinheit {
  bezeichnung: string;
  art: "WOHNUNG" | "GEWERBE";
  flaeche: Decimal;
  lage: string;
  /** Erwartete Nettokaltmiete pro Monat bei Neuvermietung; nur bei Leerstand gesetzt. */
  erwarteteMiete: Decimal | null;
  notiz: string | null;
  mietverhaeltnisse: TestMietverhaeltnis[];
}

export interface TestHaus {
  schluessel: string;
  gesellschaft: string;
  bezeichnung: string;
  strasse: string;
  plz: string;
  ort: string;
  kaufpreis: Decimal;
  kaufdatum: string;
  verkehrswerte: { wert: Decimal; stichtag: string; quelle: string }[];
  einheiten: TestEinheit[];
  investitionen: { datum: string; betrag: Decimal; kategorie: string; beschreibung: string; einheit: string | null }[];
}

export interface TestPortfolio {
  gesellschaften: readonly TestGesellschaft[];
  haeuser: TestHaus[];
  kredite: TestKredit[];
}

// ---------------------------------------------------------------------------
// Erzeugung
// ---------------------------------------------------------------------------

function zufallsMonat(z: Zufall, vonJahr: number, bisJahr: number, bisMonat = 12): string {
  const jahr = z.ganz(vonJahr, bisJahr);
  const monat = z.ganz(1, jahr === bisJahr ? bisMonat : 12);
  return `${jahr}-${String(monat).padStart(2, "0")}-01`;
}

function baueHaus(v: HausVorgabe): TestHaus {
  const z = zufall(`haus-${v.schluessel}`);
  const verkehrswert = dezimal(v.verkehrswert).times(100_000);
  const kaufpreis = verkehrswert.times(100 - v.kaufabschlag).dividedBy(100).dividedBy(50_000).toDecimalPlaces(0).times(50_000);
  const faktor = dezimal(v.faktor).dividedBy(10);
  const sollMonatVermietet = kaufpreis.dividedBy(faktor).dividedBy(12);
  const niveau = dezimal(v.mietniveau).dividedBy(100);

  // Flächen: vermietete Fläche aus Miete und Mietniveau, dazu Leerstand.
  const gewerbeFlaechen = Array.from({ length: v.gewerbe }, () => dezimal(z.ganz(90, 380)));
  const gewerbeSumme = gewerbeFlaechen.reduce((s, f) => s.plus(f), dezimal(0));
  const vermieteteFlaeche = sollMonatVermietet.dividedBy(niveau);
  const gesamtFlaeche = vermieteteFlaeche.times(100).dividedBy(100 - v.leerstand);
  const wohnFlaeche = gesamtFlaeche.minus(gewerbeSumme);
  const anzahl = Math.min(78, Math.max(32, wohnFlaeche.dividedBy(z.ganz(62, 72)).round().toNumber()));
  const mittel = wohnFlaeche.dividedBy(anzahl);

  // Wohnungsgrößen um den Mittelwert streuen und auf die Gesamtfläche hochrechnen.
  const roh = Array.from({ length: anzahl }, () => mittel.times(z.faktor(5500, 15500)));
  const rohSumme = roh.reduce((s, f) => s.plus(f), dezimal(0));
  const wohnungsFlaechen = roh.map((f) => f.times(wohnFlaeche).dividedBy(rohSumme).toDecimalPlaces(1));

  const proEtage = anzahl > 60 ? 6 : anzahl > 40 ? 5 : 4;
  const einheiten: (TestEinheit & { gewicht: Decimal; altmieter: boolean })[] = [];
  gewerbeFlaechen.forEach((flaeche, i) => {
    einheiten.push({
      bezeichnung: `GE ${String(i + 1).padStart(2, "0")}`, art: "GEWERBE", flaeche, lage: i === 0 ? "EG" : `EG ${POSITIONEN[i]}`,
      erwarteteMiete: null, notiz: null, mietverhaeltnisse: [], gewicht: z.faktor(10000, 13500), altmieter: false,
    });
  });
  wohnungsFlaechen.forEach((flaeche, i) => {
    const etage = Math.floor(i / proEtage) + (v.gewerbe > 0 ? 1 : 0);
    einheiten.push({
      bezeichnung: `WE ${String(i + 1).padStart(2, "0")}`, art: "WOHNUNG", flaeche,
      lage: `${etage === 0 ? "EG" : `${etage}. OG`} ${POSITIONEN[i % proEtage]}`,
      erwarteteMiete: null, notiz: null, mietverhaeltnisse: [], gewicht: z.faktor(9000, 11200), altmieter: false,
    });
  });

  // Altmieter mit deutlich niedrigerer Miete pro m² (2 bis 4 je Haus).
  const wohnungen = einheiten.filter((e) => e.art === "WOHNUNG");
  const gemischt = z.mische(wohnungen);
  const anzahlAlt = z.ganz(2, 4);

  // Leerstand: kleinere Wohnungen nach und nach leer, bis die Zielquote erreicht ist.
  const leer = new Set<TestEinheit>();
  if (v.leerstand > 0) {
    let leerFlaeche = dezimal(0);
    const grenze = gesamtFlaeche.times(v.leerstand).dividedBy(100);
    for (const e of gemischt.slice(anzahlAlt)) {
      if (leerFlaeche.greaterThanOrEqualTo(grenze)) break;
      if (e.flaeche.greaterThan(80)) continue;
      leer.add(e);
      leerFlaeche = leerFlaeche.plus(e.flaeche);
    }
  }
  for (const e of gemischt.slice(0, anzahlAlt)) {
    e.altmieter = true;
    e.gewicht = z.faktor(5800, 7200);
  }

  // Soll-Miete so skalieren, dass Kaufpreis / Jahres-Soll-Miete = Kaufpreisfaktor.
  const vermietet = einheiten.filter((e) => !leer.has(e));
  const gewichtSumme = vermietet.reduce((s, e) => s.plus(e.flaeche.times(e.gewicht)), dezimal(0));
  const proGewicht = sollMonatVermietet.dividedBy(gewichtSumme);

  const rueckstaendler = new Set(z.mische(vermietet).slice(0, z.ganz(2, 4)));
  const minderung = z.chance(60) ? z.waehle(vermietet.filter((e) => !rueckstaendler.has(e))) : null;

  for (const e of einheiten) {
    const soll = aufCent(e.flaeche.times(e.gewicht).times(proGewicht));
    if (leer.has(e)) {
      // Leerstand: teils mit beendetem Vormietverhältnis, teils schon länger leer.
      const leerSeit = zufallsMonat(z, 2025, 2026, 9);
      e.notiz = `Leerstand seit ${leerSeit.slice(5, 7)}/${leerSeit.slice(0, 4)}`;
      // Bei Neuvermietung wird etwas mehr als der Hausdurchschnitt erwartet.
      e.erwarteteMiete = aufCent(soll.times(z.faktor(10300, 11000)));
      if (z.chance(60)) {
        e.mietverhaeltnisse.push({
          mieter: { name: personenName(z, false), istFirma: false },
          beginn: zufallsMonat(z, 2012, 2022), ende: tagDavor(leerSeit),
          istMiete: soll, sollMiete: soll, letzteMieterhoehung: null,
          rueckstand: dezimal(0), rueckstandStichtag: null, notiz: "Mietverhältnis beendet (Kündigung durch Mieter)",
        });
      }
      continue;
    }

    const beginn = e.altmieter ? zufallsMonat(z, 1988, 2006) : e.art === "GEWERBE" ? zufallsMonat(z, 2014, 2024) : zufallsMonat(z, 2008, 2026, 9);
    let letzteMieterhoehung: string | null = null;
    if (e.altmieter) {
      letzteMieterhoehung = z.chance(50) ? null : zufallsMonat(z, 2011, 2018);
    } else if (beginn < "2025-06-01" && !z.chance(12)) {
      const frueheste = Math.max(Number(beginn.slice(0, 4)) + 1, 2018);
      letzteMieterhoehung = zufallsMonat(z, frueheste, 2026, 10);
    }

    let ist = soll;
    let rueckstand = dezimal(0);
    let notiz: string | null = e.altmieter ? "Altvertrag, Miete deutlich unter Hausdurchschnitt" : null;
    if (rueckstaendler.has(e)) {
      const monate = z.ganz(1, 5);
      const teilzahlung = z.chance(50);
      ist = teilzahlung ? aufCent(soll.times(z.ganz(40, 70)).dividedBy(100)) : dezimal(0);
      rueckstand = aufCent(soll.minus(ist).times(monate));
      notiz = `Zahlt seit ${monate} Monat(en) ${teilzahlung ? "nur teilweise" : "nicht"}`;
    } else if (e === minderung) {
      ist = aufCent(soll.times(z.ganz(80, 92)).dividedBy(100));
      notiz = `Mietminderung wegen ${z.waehle(MINDERUNGSGRUENDE)}`;
    }

    e.mietverhaeltnisse.push({
      mieter: e.art === "GEWERBE"
        ? { name: z.waehle(FIRMEN), istFirma: true }
        : { name: personenName(z, e.altmieter), istFirma: false },
      beginn,
      ende: null,
      istMiete: ist,
      sollMiete: soll,
      letzteMieterhoehung,
      rueckstand,
      rueckstandStichtag: rueckstand.greaterThan(0) ? STICHTAG : null,
      notiz,
    });
  }

  // Verkehrswerte: Gutachten der letzten drei Jahre, aktueller Wert zum 31.12.2025.
  const verkehrswerte: TestHaus["verkehrswerte"] = [];
  for (const [jahr, min, max, quelle] of [
    [2023, 9300, 10100, "Gutachten"],
    [2024, 9500, 10200, "Bankbewertung"],
  ] as const) {
    if (v.kaufdatum < `${jahr}-12-31`) {
      verkehrswerte.push({ wert: verkehrswert.times(z.faktor(min, max)).dividedBy(100_000).round().times(100_000), stichtag: `${jahr}-12-31`, quelle });
    }
  }
  verkehrswerte.push({ wert: verkehrswert, stichtag: "2025-12-31", quelle: "Gutachten" });

  const investitionen = z.mische(INVESTITIONEN).slice(0, z.ganz(1, 3)).map((inv) => {
    const einheit = inv.kategorie === "Modernisierung Wohnung" ? z.waehle(wohnungen).bezeichnung : null;
    return {
      datum: zufallsMonat(z, Math.max(Number(v.kaufdatum.slice(0, 4)) + 1, 2019), 2026, 9),
      betrag: dezimal(z.ganz(inv.min / 100, inv.max / 100)).times(100),
      kategorie: inv.kategorie,
      beschreibung: inv.beschreibung,
      einheit,
    };
  });

  return {
    schluessel: v.schluessel,
    gesellschaft: v.gesellschaft,
    bezeichnung: v.strasse,
    strasse: v.strasse,
    plz: v.plz,
    ort: v.ort,
    kaufpreis,
    kaufdatum: v.kaufdatum,
    verkehrswerte,
    einheiten: einheiten.map((e) => ({
      bezeichnung: e.bezeichnung, art: e.art, flaeche: e.flaeche, lage: e.lage, erwarteteMiete: e.erwarteteMiete, notiz: e.notiz, mietverhaeltnisse: e.mietverhaeltnisse,
    })),
    investitionen,
  };
}

function personenName(z: Zufall, aelter: boolean): string {
  const vorname = z.waehle(aelter ? AELTERE_VORNAMEN : VORNAMEN);
  const nachname = z.waehle(NACHNAMEN);
  return z.chance(12) ? `Familie ${nachname}` : `${vorname} ${nachname}`;
}

function tagDavor(datum: string): string {
  const d = new Date(`${datum}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Erzeugt den vollständigen Testdatensatz. */
export function erzeugePortfolio(): TestPortfolio {
  const haeuser = HAUS_VORGABEN.map(baueHaus);
  const zielSchuld = new Map(HAUS_VORGABEN.map((v) => [v.schluessel, dezimal(v.verkehrswert).times(100_000).times(v.ltv).dividedBy(100)]));
  const kaufpreis = new Map(haeuser.map((h) => [h.schluessel, h.kaufpreis]));
  return { gesellschaften: GESELLSCHAFTEN, haeuser, kredite: baueKredite(zielSchuld, kaufpreis) };
}

// ---------------------------------------------------------------------------
// Kennzahlen je Haus (für Tests und die Übersicht in testdaten/)
// ---------------------------------------------------------------------------

export interface HausKennzahlen {
  haus: string;
  verkehrswert: Decimal;
  kaufpreis: Decimal;
  einheiten: number;
  gewerbe: number;
  flaeche: Decimal;
  leerFlaeche: Decimal;
  leerstandProzent: Decimal;
  sollMonat: Decimal;
  istMonat: Decimal;
  /** Erwartete Monatsmiete der leeren Einheiten (Soll-Miete für Leerstand) */
  erwartetLeerMonat: Decimal;
  faktor: Decimal;
  bruttoanfangsrendite: Decimal;
  mieteProM2: Decimal;
  restschuld: Decimal;
  ltv: Decimal;
  kredite: number;
}

export function aktiveMietverhaeltnisse(e: TestEinheit): TestMietverhaeltnis[] {
  return e.mietverhaeltnisse.filter((m) => m.ende === null || m.ende >= STICHTAG);
}

export function kennzahlen(p: TestPortfolio): HausKennzahlen[] {
  return p.haeuser.map((h) => {
    let flaeche = dezimal(0), leerFlaeche = dezimal(0), erwartetLeerMonat = dezimal(0), sollMonat = dezimal(0), istMonat = dezimal(0), vermietetFlaeche = dezimal(0);
    for (const e of h.einheiten) {
      flaeche = flaeche.plus(e.flaeche);
      const aktiv = aktiveMietverhaeltnisse(e);
      if (aktiv.length === 0) {
        leerFlaeche = leerFlaeche.plus(e.flaeche);
        erwartetLeerMonat = erwartetLeerMonat.plus(e.erwarteteMiete ?? 0);
      }
      else vermietetFlaeche = vermietetFlaeche.plus(e.flaeche);
      for (const m of aktiv) {
        sollMonat = sollMonat.plus(m.sollMiete);
        istMonat = istMonat.plus(m.istMiete);
      }
    }
    const kredite = p.kredite.filter((k) => k.haeuser.some((x) => x.haus === h.schluessel));
    const restschuld = kredite.reduce((s, k) => {
      const anteil = k.haeuser.find((x) => x.haus === h.schluessel)!.anteilProzent;
      return s.plus(k.restschuldStichtag.times(anteil).dividedBy(100));
    }, dezimal(0));
    const verkehrswert = h.verkehrswerte[h.verkehrswerte.length - 1].wert;
    const sollJahr = sollMonat.times(12);
    return {
      haus: h.schluessel,
      verkehrswert,
      kaufpreis: h.kaufpreis,
      einheiten: h.einheiten.length,
      gewerbe: h.einheiten.filter((e) => e.art === "GEWERBE").length,
      flaeche,
      leerFlaeche,
      leerstandProzent: leerFlaeche.times(100).dividedBy(flaeche),
      sollMonat,
      istMonat,
      erwartetLeerMonat,
      faktor: h.kaufpreis.dividedBy(sollJahr),
      bruttoanfangsrendite: sollJahr.times(100).dividedBy(h.kaufpreis),
      mieteProM2: sollMonat.dividedBy(vermietetFlaeche),
      restschuld,
      ltv: restschuld.times(100).dividedBy(verkehrswert),
      kredite: kredite.length,
    };
  });
}
