/**
 * Import von Kreditbuchungen aus Bank-CSVs. Statt fester Bankformate werden die Spalten
 * über bekannte Namen erkannt (deutsch und englisch), so funktionieren auch neue Banken,
 * solange sie übliche Spaltennamen verwenden.
 *
 * Erkannt werden:
 * - Datum (Buchungstag, Buchungsdatum, booking_date …)
 * - Art (Buchungstext, Umsatzart, transaction_type …), notfalls aus dem Verwendungszweck
 * - Betrag als eine Spalte (Vorzeichen egal) oder getrennt in Soll und Haben
 * - Restschuld/Saldo nach der Buchung (Vorzeichen egal)
 * - IBAN und Darlehensnummer aus Spalten oder aus dem Kopfblock vor der Tabelle
 */
import type { Decimal } from "../geld";
import type { IsoDatum } from "../datum";
import type { BuchungsArt } from "../kredit";
import { dekodiere, findeTabelle, leseCsv, leseDatum, leseZahl, normalisiere } from "./csv";

export interface ImportBuchung {
  zeile: number;
  datum: IsoDatum;
  art: BuchungsArt;
  betrag: Decimal;
  saldoNach: Decimal | null;
  text: string;
}

export interface KreditImport {
  /** Kurzbeschreibung der erkannten Spalten, z. B. "Betrag, Saldo, Buchungsart" */
  aufbau: string;
  iban: string | null;
  kreditnummer: string | null;
  buchungen: ImportBuchung[];
  /** Zeilen, die nicht gelesen werden konnten */
  fehler: Array<{ zeile: number; grund: string }>;
}

const SPALTEN = {
  datum: ["buchungstag", "buchungsdatum", "datum", "bookingdate", "date", "valutadatum"],
  art: ["buchungstext", "umsatzart", "transactiontype", "art", "typ", "buchungsart", "type"],
  zweck: ["verwendungszweck", "bemerkung", "description", "text", "beschreibung"],
  betrag: ["betrag", "amount", "umsatz"],
  soll: ["soll", "lastschrift", "debit"],
  haben: ["haben", "gutschrift", "credit"],
  saldo: ["saldo", "restschuld", "outstandingbalance", "balance", "kontostand"],
  iban: ["accountiban", "iban", "darlehenskonto"],
  kreditnummer: ["loanid", "darlehensnummer", "kreditnummer", "vertragsnummer"],
} as const;

type Feld = keyof typeof SPALTEN;

/** Ordnet eine Buchungsbezeichnung einer Buchungsart zu. */
export function erkenneArt(text: string): BuchungsArt {
  const s = normalisiere(text);
  if (/sondertilg|unscheduled|prepayment/.test(s)) return "SONDERTILGUNG";
  if (/zins|interest/.test(s)) return "ZINS";
  if (/tilg|principal|repayment/.test(s)) return "TILGUNG";
  if (/gebuehr|entgelt|fee|provision/.test(s)) return "GEBUEHR";
  if (/auszahl|disburs|valutierung/.test(s)) return "AUSZAHLUNG";
  return "SONSTIGES";
}

/** Werte aus dem Kopfblock wie `"IBAN:";"DE19 …"` oder `Darlehensnummer;TN-…`. */
function ausKopfblock(zeilen: string[][], bis: number, feld: "iban" | "kreditnummer"): string | null {
  for (const z of zeilen.slice(0, bis)) {
    if (z.length >= 2 && (SPALTEN[feld] as readonly string[]).includes(normalisiere(z[0]))) return z[1] || null;
  }
  return null;
}

/** Liest eine Bank-CSV (Bytes einer hochgeladenen Datei oder bereits dekodierter Text). */
export function leseKreditbuchungen(daten: Uint8Array | string): KreditImport {
  const zeilen = leseCsv(typeof daten === "string" ? daten : dekodiere(daten));
  const kopf = findeTabelle(
    zeilen,
    SPALTEN,
    (s) => s.datum !== undefined && (s.betrag !== undefined || (s.soll !== undefined && s.haben !== undefined)),
  );
  if (!kopf) return { aufbau: "", iban: null, kreditnummer: null, buchungen: [], fehler: [{ zeile: 0, grund: "kopfzeile" }] };
  const { index, spalten } = kopf;
  const wert = (z: string[], feld: Feld) => (spalten[feld] !== undefined ? (z[spalten[feld]!] ?? "") : "");

  const buchungen: ImportBuchung[] = [];
  const fehler: KreditImport["fehler"] = [];
  let iban = ausKopfblock(zeilen, index, "iban");
  let kreditnummer = ausKopfblock(zeilen, index, "kreditnummer");

  zeilen.slice(index + 1).forEach((z, i) => {
    const nr = index + i + 2;
    if (z.every((f) => f === "")) return;
    const datum = leseDatum(wert(z, "datum"));
    if (!datum) return fehler.push({ zeile: nr, grund: "datum" });
    let betrag: Decimal | null;
    if (spalten.betrag !== undefined) betrag = leseZahl(wert(z, "betrag"));
    else betrag = leseZahl(wert(z, "soll")) ?? leseZahl(wert(z, "haben"));
    if (!betrag || betrag.isZero()) return fehler.push({ zeile: nr, grund: "betrag" });
    const artText = wert(z, "art") || wert(z, "zweck");
    const saldo = leseZahl(wert(z, "saldo"));
    iban ??= wert(z, "iban") || null;
    kreditnummer ??= wert(z, "kreditnummer") || null;
    buchungen.push({
      zeile: nr,
      datum,
      art: erkenneArt(artText),
      betrag: betrag.abs(),
      saldoNach: saldo ? saldo.abs() : null,
      text: [wert(z, "art"), wert(z, "zweck")].filter(Boolean).join(" · "),
    });
  });

  const teile = [
    spalten.betrag !== undefined ? "Betrag" : "Soll/Haben",
    spalten.saldo !== undefined ? "Saldo" : null,
    spalten.art !== undefined ? "Buchungsart" : "Art aus Text",
  ].filter(Boolean);
  return {
    aufbau: teile.join(", "),
    iban: iban ? iban.replace(/\s/g, "").toUpperCase() : null,
    kreditnummer,
    buchungen: buchungen.sort((a, b) => (a.datum === b.datum ? a.zeile - b.zeile : a.datum < b.datum ? -1 : 1)),
    fehler,
  };
}

/** Schlüssel für die Dublettenprüfung: gleicher Tag, gleiche Art, gleicher Betrag. */
export function buchungsSchluessel(b: { datum: IsoDatum; art: BuchungsArt; betrag: Decimal }): string {
  return `${b.datum}|${b.art}|${b.betrag.toFixed(2)}`;
}
