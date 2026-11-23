/**
 * Kleine Hilfen für den Testdaten-Generator: reproduzierbarer Zufall, Datumsrechnung,
 * Test-IBANs und angenäherte Euribor-Werte.
 *
 * Der Zufall liefert nur ganze Zahlen. Beträge werden daraus mit Decimal gebildet,
 * damit keine Gleitkomma-Ungenauigkeiten entstehen.
 */
import { dezimal, type Decimal } from "../../src/lib/geld";

// ---------------------------------------------------------------------------
// Reproduzierbarer Zufall (mulberry32). Gleicher Startwert = gleiche Testdaten.
// ---------------------------------------------------------------------------

export type Zufall = ReturnType<typeof zufall>;

export function zufall(startwert: string | number) {
  let a = typeof startwert === "number" ? startwert >>> 0 : textHash(startwert);
  const naechste = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const ganz = (min: number, max: number) => min + Math.floor(naechste() * (max - min + 1));
  return {
    /** Ganze Zahl zwischen min und max (beide eingeschlossen). */
    ganz,
    /** true mit der angegebenen Wahrscheinlichkeit in Prozent. */
    chance: (prozent: number) => ganz(1, 100) <= prozent,
    waehle: <T>(liste: readonly T[]): T => liste[ganz(0, liste.length - 1)],
    mische: <T>(liste: readonly T[]): T[] => {
      const kopie = [...liste];
      for (let i = kopie.length - 1; i > 0; i--) {
        const j = ganz(0, i);
        [kopie[i], kopie[j]] = [kopie[j], kopie[i]];
      }
      return kopie;
    },
    /** Faktor als Decimal zwischen min und max, angegeben in Basispunkten (10000 = 1,0). */
    faktor: (minBp: number, maxBp: number): Decimal => dezimal(ganz(minBp, maxBp)).dividedBy(10000),
  };
}

function textHash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Datum als Text "JJJJ-MM-TT". Monate werden als fortlaufende Zahl gerechnet.
// ---------------------------------------------------------------------------

/** Fortlaufende Monatsnummer (Jahr * 12 + Monat - 1). */
export function monatsNummer(datum: string): number {
  const [jahr, monat] = datum.split("-").map(Number);
  return jahr * 12 + monat - 1;
}

export function monatsende(nummer: number): string {
  const jahr = Math.floor(nummer / 12);
  const monat = (nummer % 12) + 1;
  const tag = new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
  return `${jahr}-${zwei(monat)}-${zwei(tag)}`;
}

export function monatsanfang(nummer: number): string {
  const jahr = Math.floor(nummer / 12);
  return `${jahr}-${zwei((nummer % 12) + 1)}-01`;
}

/** Addiert Jahre; der Tag vor dem Jahrestag (z. B. 2017-03-15 + 10 = 2027-03-14). */
export function plusJahre(datum: string, jahre: number): string {
  const [j, m, t] = datum.split("-").map(Number);
  const d = new Date(Date.UTC(j + jahre, m - 1, t - 1));
  return d.toISOString().slice(0, 10);
}

function zwei(n: number) {
  return String(n).padStart(2, "0");
}

// ---------------------------------------------------------------------------
// Test-IBANs: gültige Prüfziffer, aber Bankleitzahl 9999xxxx. Bankleitzahlen
// beginnen in Deutschland nie mit 9, solche IBANs gehören also zu keiner echten Bank.
// ---------------------------------------------------------------------------

export function testIban(bankleitzahl: string, konto: string): string {
  if (!/^9999\d{4}$/.test(bankleitzahl)) throw new Error("Test-Bankleitzahl muss mit 9999 beginnen");
  const bban = bankleitzahl + konto.padStart(10, "0");
  // Prüfziffer nach ISO 13616: "DE00" ans Ende, Buchstaben in Zahlen (D=13, E=14), mod 97.
  const rest = Number(BigInt(bban + "131400") % BigInt(97));
  return `DE${zwei(98 - rest)}${bban}`;
}

export function ibanIstGueltig(iban: string): boolean {
  const umgestellt = iban.slice(4) + iban.slice(0, 4);
  const ziffern = umgestellt.replace(/[A-Z]/g, (b) => String(b.charCodeAt(0) - 55));
  return BigInt(ziffern) % BigInt(97) === BigInt(1);
}

// ---------------------------------------------------------------------------
// Euribor: angenäherte Monatswerte in Prozent (keine amtlichen Werte; ab 2026
// frei angenommen). Reicht, um variable Kredite realistisch durchzurechnen.
// ---------------------------------------------------------------------------

const EURIBOR_3M: Record<number, string[]> = {
  2015: ["0.06", "0.05", "0.03", "0.00", "-0.01", "-0.01", "-0.02", "-0.03", "-0.04", "-0.05", "-0.09", "-0.13"],
  2016: ["-0.15", "-0.18", "-0.23", "-0.25", "-0.26", "-0.27", "-0.29", "-0.30", "-0.30", "-0.31", "-0.31", "-0.32"],
  2017: ["-0.33", "-0.33", "-0.33", "-0.33", "-0.33", "-0.33", "-0.33", "-0.33", "-0.33", "-0.33", "-0.33", "-0.33"],
  2018: ["-0.33", "-0.33", "-0.33", "-0.33", "-0.33", "-0.32", "-0.32", "-0.32", "-0.32", "-0.32", "-0.32", "-0.31"],
  2019: ["-0.31", "-0.31", "-0.31", "-0.31", "-0.31", "-0.33", "-0.37", "-0.41", "-0.42", "-0.41", "-0.40", "-0.40"],
  2020: ["-0.39", "-0.41", "-0.42", "-0.25", "-0.27", "-0.38", "-0.44", "-0.48", "-0.49", "-0.51", "-0.52", "-0.54"],
  2021: ["-0.55", "-0.55", "-0.54", "-0.54", "-0.54", "-0.54", "-0.55", "-0.55", "-0.55", "-0.55", "-0.57", "-0.58"],
  2022: ["-0.56", "-0.53", "-0.50", "-0.45", "-0.39", "-0.24", "0.04", "0.40", "1.01", "1.43", "1.83", "2.06"],
  2023: ["2.35", "2.64", "2.91", "3.17", "3.37", "3.54", "3.67", "3.78", "3.88", "3.97", "3.97", "3.93"],
  2024: ["3.93", "3.92", "3.92", "3.89", "3.81", "3.72", "3.69", "3.55", "3.43", "3.17", "3.01", "2.82"],
  2025: ["2.70", "2.52", "2.44", "2.25", "2.09", "1.98", "1.99", "2.02", "2.03", "2.03", "2.05", "2.07"],
  2026: ["2.05", "2.03", "2.04", "2.08", "2.12", "2.15", "2.17", "2.17", "2.16", "2.14", "2.13", "2.12"],
};

/** Abstand 6M zu 3M je Jahr in Prozentpunkten (angenähert). */
const AUFSCHLAG_6M: Record<number, string> = {
  2015: "0.08", 2016: "0.08", 2017: "0.06", 2018: "0.06", 2019: "0.05", 2020: "0.07",
  2021: "0.03", 2022: "0.25", 2023: "0.15", 2024: "-0.05", 2025: "0.05", 2026: "0.08",
};

export type Referenzzins = "3M-EURIBOR" | "6M-EURIBOR";

export function euribor(referenz: Referenzzins, monat: number): Decimal {
  const jahr = Math.floor(monat / 12);
  const werte = EURIBOR_3M[jahr];
  if (!werte) throw new Error(`Kein Euribor-Wert für ${jahr}`);
  const dreiMonate = dezimal(werte[monat % 12]);
  return referenz === "3M-EURIBOR" ? dreiMonate : dreiMonate.plus(AUFSCHLAG_6M[jahr]);
}
