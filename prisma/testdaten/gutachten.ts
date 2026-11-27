/**
 * Frei erfundene Verkehrswertgutachten für die Testdaten. Gutachter und Texte sind Testwerte.
 *
 * Herleitung: Liegenschaftszins, Restnutzungsdauer und Bodenwertanteil werden gewählt, der
 * Reinertrag so bestimmt, dass das Ertragswertverfahren den Verkehrswert ergibt
 * (Reinertrag = (Verkehrswert − Bodenwert) ÷ Barwertfaktor + Bodenwert × Liegenschaftszins),
 * der Rohertrag aus Bewirtschaftungskosten von 18 bis 24 %. Ältere Gutachten lassen einzelne
 * Faktoren weg, damit die Ansicht Datenlücken zeigt.
 */
import { aufCent, dezimal, type Decimal } from "../../src/lib/geld";
import { barwertfaktor } from "../../src/lib/gutachten";
import { zufall } from "./hilfen";

export interface TestGutachten {
  stichtag: string;
  erstelltAm: string;
  gutachter: string;
  anlass: string;
  verfahren: "ERTRAGSWERT" | "SACHWERT" | "VERGLEICHSWERT";
  verkehrswert: Decimal;
  rohertragJahr: Decimal | null;
  bewirtschaftungskosten: Decimal | null;
  reinertragJahr: Decimal | null;
  liegenschaftszins: Decimal | null;
  restnutzungsdauer: number | null;
  gesamtnutzungsdauer: number | null;
  barwertfaktor: Decimal | null;
  bodenwert: Decimal | null;
  /** Gebäudeertragswert, nur in einem Teil der neuesten Gutachten angegeben */
  gebaeudewert: Decimal | null;
  ertragswert: Decimal | null;
  zuAbschlaege: Decimal | null;
  baujahr: number | null;
  wohnflaeche: Decimal | null;
  gewerbeflaeche: Decimal | null;
  grundstuecksflaeche: Decimal | null;
  einheiten: number | null;
  zustand: string | null;
  energieklasse: string | null;
  lage: string | null;
  staerken: string | null;
  schwaechen: string | null;
  chancen: string | null;
  risiken: string | null;
}

const GUTACHTER = [
  "Sachverständigenbüro Ahornweg (Testdaten)",
  "Dipl.-Ing. Wertfeld, ö. b. u. v. Sachverständiger (Testdaten)",
  "Immobilienbewertung Nordlicht GmbH (Testdaten)",
];
const STAERKEN = [
  "Gute Anbindung an den öffentlichen Nahverkehr",
  "Gefragte Wohnlage mit stabiler Nachfrage",
  "Ausgewogener Wohnungsmix mit überwiegend 2- und 3-Zimmer-Wohnungen",
  "Gepflegtes Treppenhaus und Gemeinschaftsflächen",
  "Mieten unter dem örtlichen Mietspiegel, Steigerungspotenzial vorhanden",
  "Nahversorgung fußläufig erreichbar",
];
const SCHWAECHEN = [
  "Teilweise veraltete Bäder in den Bestandswohnungen",
  "Kein Aufzug in den Obergeschossen",
  "Energetischer Zustand unter heutigem Standard",
  "Wenige Stellplätze auf dem Grundstück",
  "Straßenlärm an der Vorderseite",
];
const CHANCEN = [
  "Dachgeschossausbau baurechtlich voraussichtlich möglich",
  "Anpassung der Altmieten bei Mieterwechsel",
  "Energetische Modernisierung mit Umlage nach § 559 BGB",
  "Aufwertung des Quartiers durch geplante Infrastrukturprojekte",
];
const RISIKEN = [
  "Mögliche Verschärfung der Mietpreisbremse",
  "Steigende Instandhaltungskosten durch Gebäudealter",
  "Zinsumfeld belastet die Kaufpreisfaktoren",
  "Anforderungen aus dem Gebäudeenergiegesetz",
  "Leerstand bei Gewerbeeinheiten im Erdgeschoss",
];
const ZUSTAND = ["gut", "befriedigend", "durchschnittlich, mit Instandhaltungsstau"];
const ENERGIE = ["C", "D", "E", "F"];

function waehleMehrere(z: ReturnType<typeof zufall>, liste: string[], min: number, max: number) {
  return z.mische(liste).slice(0, z.ganz(min, max)).join("\n");
}

/**
 * Gutachten zu den angegebenen Stichtagen und Verkehrswerten eines Hauses (älteste zuerst).
 * Das neueste ist vollständig, ältere lassen abwechselnd Faktoren oder die SWOT weg.
 */
export function baueGutachten(
  schluessel: string,
  werte: { stichtag: string; wert: Decimal }[],
  objekt: { wohnflaeche: Decimal; gewerbeflaeche: Decimal; einheiten: number; ort: string },
): TestGutachten[] {
  const z = zufall(`gutachten-${schluessel}`);
  const baujahr = z.ganz(1898, 1994);
  const gesamtnutzungsdauer = 80;
  const grundstueck = objekt.wohnflaeche.plus(objekt.gewerbeflaeche).times(z.faktor(3500, 6000)).round();
  const gutachter = z.waehle(GUTACHTER);
  const energieklasse = z.waehle(ENERGIE);
  const lage = z.chance(50) ? `Innenstadtnahe Wohnlage in ${objekt.ort}` : `Gefragte Wohnlage in ${objekt.ort}, gute Infrastruktur`;
  let lz = dezimal(z.ganz(250, 350)).dividedBy(100);

  return werte.map((w, i) => {
    const neuestes = i === werte.length - 1;
    const jahr = Number(w.stichtag.slice(0, 4));
    // Modernisierte Gebäude haben eine längere Restnutzungsdauer als das reine Alter ergäbe.
    const rnd = Math.max(25, Math.min(60, gesamtnutzungsdauer - (jahr - baujahr) + 40));
    const bwf = barwertfaktor(lz, rnd)!.toDecimalPlaces(4);
    const bodenwert = w.wert.times(z.faktor(2200, 3400)).dividedBy(10_000).round().times(10_000);
    const reinertrag = aufCent(w.wert.minus(bodenwert).dividedBy(bwf).plus(bodenwert.times(lz).dividedBy(100)));
    const bwkAnteil = dezimal(z.ganz(18, 24));
    const rohertrag = aufCent(reinertrag.times(100).dividedBy(dezimal(100).minus(bwkAnteil)));
    const ohneFaktoren = !neuestes && i % 2 === 0;
    const ohneSwot = !neuestes && i % 2 === 1;
    const g: TestGutachten = {
      stichtag: w.stichtag,
      erstelltAm: `${jahr + 1}-0${z.ganz(1, 3)}-${String(z.ganz(10, 28))}`,
      gutachter,
      anlass: neuestes ? "Jahresabschluss / Finanzierung" : z.waehle(["Finanzierung", "Jahresabschluss"]),
      verfahren: "ERTRAGSWERT",
      verkehrswert: w.wert,
      rohertragJahr: rohertrag,
      bewirtschaftungskosten: rohertrag.minus(reinertrag),
      reinertragJahr: reinertrag,
      liegenschaftszins: ohneFaktoren ? null : lz,
      restnutzungsdauer: ohneFaktoren ? null : rnd,
      gesamtnutzungsdauer: ohneFaktoren ? null : gesamtnutzungsdauer,
      barwertfaktor: ohneFaktoren ? null : bwf,
      bodenwert: ohneFaktoren ? null : bodenwert,
      gebaeudewert: neuestes && Number(schluessel.replace(/\D/g, "")) % 2 === 1 ? w.wert.minus(bodenwert) : null,
      ertragswert: w.wert,
      zuAbschlaege: dezimal(0),
      baujahr,
      wohnflaeche: objekt.wohnflaeche,
      gewerbeflaeche: objekt.gewerbeflaeche.isZero() ? null : objekt.gewerbeflaeche,
      grundstuecksflaeche: ohneFaktoren ? null : grundstueck,
      einheiten: objekt.einheiten,
      zustand: z.waehle(ZUSTAND),
      energieklasse: ohneFaktoren ? null : energieklasse,
      lage,
      staerken: ohneSwot ? null : waehleMehrere(z, STAERKEN, 2, 3),
      schwaechen: ohneSwot ? null : waehleMehrere(z, SCHWAECHEN, 1, 3),
      chancen: ohneSwot ? null : waehleMehrere(z, CHANCEN, 1, 2),
      risiken: ohneSwot ? null : waehleMehrere(z, RISIKEN, 1, 3),
    };
    // Der Liegenschaftszins sinkt im Testverlauf leicht (Marktumfeld).
    lz = lz.minus(dezimal(z.ganz(0, 15)).dividedBy(100));
    return g;
  });
}
