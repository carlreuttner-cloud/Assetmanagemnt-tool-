/**
 * Schreibt die Kreditbuchungen der Testdaten als CSV in drei absichtlich unterschiedlichen
 * Bankformaten, um den KI-Import zu testen. Alle Banken sind erfunden.
 *
 * Format A (Testbank Nord AG, Demo Landesbank): UTF-8 mit BOM, CRLF, Semikolon, Felder in
 *   Anführungszeichen, Kopfblock vor der Tabelle, TT.MM.JJJJ, 1.234,56, Beträge und Saldo negativ.
 * Format B (Beispiel Hypothekenbank AG): UTF-8, LF, Komma, englische Spalten, JJJJ-MM-TT,
 *   1234.56, neueste Buchung zuerst, alles positiv.
 * Format C (Musterland Volksbank eG): ISO-8859-1, CRLF, Semikolon, TT.MM.JJ, 1234,56 ohne
 *   Tausenderpunkt, getrennte Spalten Soll/Haben aus Sicht des Darlehenskontos (Zins im Soll,
 *   Tilgung im Haben), zusätzlich Zinssatz.
 */
import type { Decimal } from "../../src/lib/geld";
import { jahresNettokaltmiete } from "../../src/lib/miete";
import { BANKEN, BUCHUNGEN_AB, STICHTAG, type TestBuchung, type TestKredit } from "./kredite";
import { kennzahlen, type TestPortfolio } from "./portfolio";

export interface CsvDatei {
  /** Pfad relativ zu testdaten/ */
  pfad: string;
  inhalt: Buffer;
}

function zahl(wert: Decimal, { komma, tausender }: { komma: "," | "."; tausender: boolean }): string {
  const text = wert.toFixed(2);
  const negativ = text.startsWith("-");
  const [ganz, nachkomma] = text.replace("-", "").split(".");
  const gruppiert = tausender ? ganz.replace(/\B(?=(\d{3})+(?!\d))/g, ".") : ganz;
  return `${negativ ? "-" : ""}${gruppiert}${komma}${nachkomma}`;
}

const deutsch = (w: Decimal) => zahl(w, { komma: ",", tausender: true });
const datumDe = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
const datumDeKurz = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(2, 4)}`;
const monatJahr = (d: string) => `${d.slice(5, 7)}/${d.slice(0, 4)}`;
const ibanGruppiert = (iban: string) => iban.replace(/(.{4})(?=.)/g, "$1 ");
const zitiert = (felder: string[]) => felder.map((f) => `"${f.replaceAll('"', '""')}"`).join(";");

function formatA(k: TestKredit, inhaber: string): Buffer {
  const text: Record<TestBuchung["art"], string> = { ZINS: "Darlehenszinsen", TILGUNG: "Tilgung", SONDERTILGUNG: "Sondertilgung" };
  const zeilen = [
    zitiert(["Umsatzanzeige Darlehenskonto"]),
    zitiert(["Bank:", BANKEN[k.bank].name]),
    zitiert(["Kontoinhaber:", inhaber]),
    zitiert(["IBAN:", ibanGruppiert(k.iban)]),
    zitiert(["Darlehensnummer:", k.kreditnummer]),
    zitiert(["Zeitraum:", `${datumDe(BUCHUNGEN_AB)} - ${datumDe(STICHTAG)}`]),
    zitiert(["Anfangssaldo:", `${deutsch(k.saldoVorZeitraum.negated())} EUR`]),
    zitiert([""]),
    zitiert(["Buchungstag", "Valuta", "Buchungstext", "Verwendungszweck", "Betrag (EUR)", "Saldo (EUR)"]),
    ...k.buchungen.map((b) =>
      zitiert([
        datumDe(b.datum),
        datumDe(b.datum),
        text[b.art],
        `${text[b.art]} ${monatJahr(b.datum)} Darl. ${k.kreditnummer}`,
        deutsch(b.betrag.negated()),
        deutsch(b.saldoNach.negated()),
      ]),
    ),
  ];
  return Buffer.from("﻿" + zeilen.join("\r\n") + "\r\n", "utf8");
}

function formatB(k: TestKredit): Buffer {
  const typ: Record<TestBuchung["art"], string> = { ZINS: "INTEREST", TILGUNG: "PRINCIPAL", SONDERTILGUNG: "UNSCHEDULED_REPAYMENT" };
  const beschreibung: Record<TestBuchung["art"], string> = {
    ZINS: "interest payment", TILGUNG: "scheduled principal repayment", SONDERTILGUNG: "unscheduled principal repayment",
  };
  const kopf = "account_iban,loan_id,booking_date,value_date,transaction_type,description,amount,currency,outstanding_balance";
  const zeilen = [...k.buchungen].reverse().map((b) =>
    [k.iban, k.kreditnummer, b.datum, b.datum, typ[b.art], `"Loan ${k.kreditnummer} ${beschreibung[b.art]}"`, b.betrag.toFixed(2), "EUR", b.saldoNach.toFixed(2)].join(","),
  );
  return Buffer.from([kopf, ...zeilen].join("\n") + "\n", "utf8");
}

function formatC(k: TestKredit, inhaber: string): Buffer {
  const art: Record<TestBuchung["art"], string> = { ZINS: "Zinsbelastung", TILGUNG: "Tilgungsleistung", SONDERTILGUNG: "Sondertilgung" };
  const ohne = (w: Decimal) => zahl(w, { komma: ",", tausender: false });
  const zeilen = [
    `${BANKEN[k.bank].name} - Darlehensübersicht`,
    `Darlehenskonto;${ibanGruppiert(k.iban)}`,
    `Kreditnehmer;${inhaber}`,
    `Darlehensnummer;${k.kreditnummer}`,
    "",
    "Buchungsdatum;Umsatzart;Soll;Haben;Restschuld;Zinssatz %;Bemerkung",
    ...k.buchungen.map((b) => {
      const soll = b.art === "ZINS" ? ohne(b.betrag) : "";
      const haben = b.art === "ZINS" ? "" : ohne(b.betrag);
      const bemerkung = b.art === "ZINS" ? `Zinsen für ${monatJahr(b.datum)}` : b.art === "TILGUNG" ? "Planmäßige Tilgung" : "Sondertilgung lt. Vereinbarung";
      return [datumDeKurz(b.datum), art[b.art], soll, haben, ohne(b.saldoNach), b.zinssatz.toFixed(3).replace(".", ","), bemerkung].join(";");
    }),
  ];
  return Buffer.from(zeilen.join("\r\n") + "\r\n", "latin1");
}

/** Alle Beispiel-CSV-Dateien der Testdaten. */
export function csvDateien(p: TestPortfolio): CsvDatei[] {
  const inhaber = new Map(p.gesellschaften.map((g) => [g.schluessel, g.name]));
  const dateien: CsvDatei[] = p.kredite.map((k) => {
    const name = inhaber.get(k.gesellschaft)!;
    const format = BANKEN[k.bank].format;
    const inhalt = format === "A" ? formatA(k, name) : format === "B" ? formatB(k) : formatC(k, name);
    return { pfad: `kreditbuchungen/${k.kreditnummer}.csv`, inhalt };
  });

  // Übersichten zum Nachprüfen der Werte, die die App später anzeigen soll.
  const de = (w: Decimal, stellen = 2) => w.toDecimalPlaces(stellen).toFixed(stellen).replace(".", ",");
  const haeuser = new Map(p.haeuser.map((h) => [h.schluessel, h]));
  const hausZeilen = kennzahlen(p).map((k) => {
    const h = haeuser.get(k.haus)!;
    return [
      k.haus, inhaber.get(h.gesellschaft)!, h.bezeichnung, `${h.plz} ${h.ort}`, de(k.verkehrswert, 0), de(k.kaufpreis, 0),
      k.einheiten, k.gewerbe, k.stellplaetze, de(k.flaeche, 1), de(k.leerstandProzent, 1), de(k.sollMonat), de(jahresNettokaltmiete(k.sollMonat)),
      de(k.istMonat), de(jahresNettokaltmiete(k.istMonat)), de(k.erwartetLeerMonat), de(jahresNettokaltmiete(k.erwartetLeerMonat)), de(k.mieteProM2), de(k.faktor), de(k.bruttoanfangsrendite), de(k.restschuld), de(k.ltv), k.kredite,
    ].join(";");
  });
  dateien.push({
    pfad: "uebersicht-haeuser.csv",
    inhalt: Buffer.from(
      [
        "Haus;Gesellschaft;Bezeichnung;Ort;Verkehrswert;Kaufpreis;Einheiten (Wohnen + Gewerbe);davon Gewerbe;Stellplätze;Fläche m² (Wohnen + Gewerbe);Leerstand % (Fläche);Soll-Miete Monat;Soll-Miete Jahr;Ist-Miete Monat;Ist-Miete Jahr;Soll-Miete Leerstand Monat;Soll-Miete Leerstand Jahr;Soll €/m²;Kaufpreisfaktor;Bruttoanfangsrendite %;Restschuld anteilig " + datumDe(STICHTAG) + ";LTV %;Kredite",
        ...hausZeilen,
      ].join("\n") + "\n",
      "utf8",
    ),
  });
  const kreditZeilen = p.kredite.map((k) =>
    [
      k.schluessel, k.kreditnummer, BANKEN[k.bank].name, `Format ${BANKEN[k.bank].format}`, k.iban, inhaber.get(k.gesellschaft)!,
      k.haeuser.map((x) => `${x.haus} (${de(x.anteilProzent, 2)} %)`).join(" + "), k.zinsArt,
      k.sollzins ? de(k.sollzins, 2) : "", k.referenzzins ?? "", k.marge ? de(k.marge, 2) : "", k.auszahlungsdatum,
      k.zinsbindungBis ?? "", k.laufzeitBis ?? "", de(k.ursprungsbetrag), de(k.restschuldStichtag), k.tilgungsplaene.length, k.notiz ?? "",
    ].join(";"),
  );
  dateien.push({
    pfad: "uebersicht-kredite.csv",
    inhalt: Buffer.from(
      [
        "Kredit;Kreditnummer;Bank;CSV-Format;IBAN;Gesellschaft;Häuser (Anteil);Zinsart;Sollzins %;Referenzzins;Marge %;Auszahlung;Zinsbindung bis;Laufzeit bis;Ursprungsbetrag;Restschuld " + datumDe(STICHTAG) + ";Tilgungsplan-Versionen;Notiz",
        ...kreditZeilen,
      ].join("\n") + "\n",
      "utf8",
    ),
  });
  return dateien;
}
