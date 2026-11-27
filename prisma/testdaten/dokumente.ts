/**
 * Frei erfundene Dokumenten-Checkliste für die Testdaten: Pflichtdokumente aus der Vorschlagsliste
 * und Nachweise mit einer Mischung aus aktuell, veraltet, ohne Datum, fehlend und nicht erforderlich.
 * Für Gutachten, Jahresabschluss und Saldenbestätigung gibt es keine Nachweise: Deren Stand
 * ergibt sich automatisch aus den Testdaten.
 */
import { de } from "../../src/i18n/de";
import { STANDARD_VORGABEN, type Bezug } from "../../src/lib/dokumente";
import { zufall } from "./hilfen";

export interface TestVorgabe {
  schluessel: string;
  name: string;
  beschreibung: string;
  bezug: Bezug;
  gueltigMonate: number | null;
  automatik: "GUTACHTEN" | "JAHRESABSCHLUSS" | "SALDENBESTAETIGUNG" | null;
  reihenfolge: number;
}

export interface TestNachweis {
  vorgabe: string;
  bezug: Bezug;
  /** Schlüssel des Objekts (G1, H01, K01 …) */
  objekt: string;
  vorhanden: boolean;
  nichtErforderlich: boolean;
  dokumentDatum: string | null;
  ablageort: string | null;
  notiz: string | null;
}

export const TEST_VORGABEN: TestVorgabe[] = STANDARD_VORGABEN.map((v, i) => {
  const text = de.dokumente.standard[v.schluessel as keyof typeof de.dokumente.standard];
  return { ...v, name: text.name, beschreibung: text.beschreibung, reihenfolge: i };
});

const ABLAGE = ["Datenraum, Ordner Objektakte (Testdaten)", "DMS, Ablage Recht (Testdaten)", "Papierordner Büro (Testdaten)"];

function datumZwischen(z: ReturnType<typeof zufall>, vonJahr: number, bisJahr: number, bisMonat = 12) {
  const jahr = z.ganz(vonJahr, bisJahr);
  const monat = z.ganz(1, jahr === bisJahr ? bisMonat : 12);
  return `${jahr}-${String(monat).padStart(2, "0")}-${String(z.ganz(1, 28)).padStart(2, "0")}`;
}

export function baueNachweise(objekte: Array<{ bezug: Bezug; schluessel: string; ort?: string }>): TestNachweis[] {
  const liste: TestNachweis[] = [];
  for (const o of objekte) {
    for (const v of TEST_VORGABEN.filter((x) => x.bezug === o.bezug && !x.automatik)) {
      const z = zufall(`dok-${o.schluessel}-${v.schluessel}`);
      const basis = { vorgabe: v.schluessel, bezug: o.bezug, objekt: o.schluessel, ablageort: z.waehle(ABLAGE), notiz: null as string | null };
      if (v.schluessel === "baulasten" && (o.ort === "München" || o.ort === "Augsburg")) {
        liste.push({ ...basis, vorhanden: false, nichtErforderlich: true, dokumentDatum: null, ablageort: null, notiz: "In Bayern gibt es kein Baulastenverzeichnis." });
        continue;
      }
      const wurf = z.ganz(1, 100);
      if (wurf <= 65) {
        const datum =
          v.gueltigMonate === null
            ? z.chance(60) ? datumZwischen(z, 2012, 2023) : null
            : v.gueltigMonate >= 60
              ? datumZwischen(z, 2014, 2024)
              : datumZwischen(z, 2025, 2026, 10);
        liste.push({ ...basis, vorhanden: true, nichtErforderlich: false, dokumentDatum: datum });
      } else if (wurf <= 75) {
        liste.push({ ...basis, vorhanden: true, nichtErforderlich: false, dokumentDatum: null, notiz: "Datum auf der Kopie nicht lesbar." });
      } else if (wurf <= 83) {
        liste.push({ ...basis, vorhanden: false, nichtErforderlich: false, dokumentDatum: null, ablageort: null, notiz: "Angefordert, noch nicht eingegangen." });
      }
      // sonst: noch nicht erfasst (fehlt)
    }
  }
  return liste;
}
