import { describe, expect, it } from "vitest";
import { dezimal } from "@/lib/geld";
import { deZahl, leseAngebot, pruefeKiFeld, vergleicheAngebote, vergleichsMonate, type AngebotDaten } from "@/lib/bankangebot";

const TERMSHEET = `TESTDOKUMENT
Testbank Nord AG
Indikatives Finanzierungsangebot vom 15.11.2026
Darlehensbetrag: 2.500.000,00 EUR
Gebundener Sollzins: 3,85 % p. a.
Zinsbindung: 10 Jahre
Anfängliche Tilgung: 2,00 % p. a.
Auszahlung: 100 %
Bearbeitungsgebühr: 0,50 % des Darlehensbetrags
Bereitstellungszins: 0,25 % p. M. nach 6 Monate bereitstellungsfrei
Sondertilgung: jährlich bis 5 % des Darlehensbetrags
Financial Covenant: LTV höchstens 65 %
Financial Covenant: DSCR mindestens 1,20
Sicherheit: erstrangige Grundschuld über 2.500.000,00 EUR
Angebot gültig bis 15.12.2026`;

describe("Bankangebote: Auslesen", () => {
  it("liest Zahlen deutsch", () => {
    expect(deZahl("2.500.000,00")).toBe("2500000.00");
    expect(deZahl("3,85")).toBe("3.85");
    expect(deZahl("abc")).toBeNull();
  });

  it("liest Konditionen mit Beleg und rechnet nur gekennzeichnet um", () => {
    const v = leseAngebot(TERMSHEET, ["Testbank Nord AG"]);
    expect(v.bank?.wert).toBe("Testbank Nord AG");
    expect(v.betrag?.wert).toBe("2500000.00");
    expect(v.zinsArt?.wert).toBe("FEST");
    expect(v.sollzins?.wert).toBe("3.85");
    expect(v.zinsbindungMonate).toMatchObject({ wert: "120", herkunft: "berechnet" });
    expect(v.tilgungProzent?.wert).toBe("2.00");
    expect(v.auszahlungProzent?.wert).toBe("100");
    expect(v.bearbeitungsgebuehr).toMatchObject({ wert: "12500.00", herkunft: "berechnet" });
    expect(v.bereitstellungszins?.wert).toBe("0.25");
    expect(v.bereitstellungsfreiMonate?.wert).toBe("6");
    expect(v.sondertilgungProzent?.wert).toBe("5");
    expect(v.covenants?.wert).toContain("DSCR");
    expect(v.sicherheiten?.wert).toContain("Grundschuld");
    expect(v.gueltigBis?.wert).toBe("2026-12-15");
    expect(v.angebotVom?.wert).toBe("2026-11-15");
    expect(v.sollzins?.beleg).toContain("3,85");
  });

  it("erkennt variable Angebote", () => {
    const v = leseAngebot("Zinssatz: 3M-EURIBOR zzgl. Marge 1,60 % p. a.\nLaufzeit: 5 Jahre");
    expect(v.zinsArt?.wert).toBe("VARIABEL");
    expect(v.referenzzins?.wert).toBe("3M-EURIBOR");
    expect(v.marge?.wert).toBe("1.60");
    expect(v.laufzeitMonate?.wert).toBe("60");
  });

  it("verwirft KI-Werte ohne wörtlichen Beleg", () => {
    expect(pruefeKiFeld(TERMSHEET, "sollzins", "3.85", "Gebundener Sollzins: 3,85 % p. a.")?.wert).toBe("3.85");
    expect(pruefeKiFeld(TERMSHEET, "sollzins", "3.95", "Gebundener Sollzins: 3,85 % p. a.")).toBeNull();
    expect(pruefeKiFeld(TERMSHEET, "sollzins", "3.85", "Sollzins 3,85 %, erfunden")).toBeNull();
    expect(pruefeKiFeld(TERMSHEET, "betrag", "2500000", "Darlehensbetrag: 2.500.000,00 EUR")?.wert).toBe("2500000");
    expect(pruefeKiFeld(TERMSHEET, "zinsbindungMonate", "120", "Zinsbindung: 10 Jahre")?.herkunft).toBe("berechnet");
  });
});

const basis: AngebotDaten = {
  id: "a",
  name: "A",
  betrag: dezimal("1000000"),
  zinsArt: "FEST",
  sollzins: dezimal("4"),
  referenzzins: null,
  marge: null,
  zinsbindungMonate: 120,
  laufzeitMonate: null,
  zahlweise: "MONATLICH",
  tilgungsart: "ANNUITAET",
  tilgungProzent: dezimal("2"),
  auszahlungProzent: dezimal("100"),
  bearbeitungsgebuehr: dezimal("0"),
  sonstigeKosten: null,
};

describe("Bankangebote: Vergleich", () => {
  it("rechnet Zinsen, Restschuld und Effektivzins", () => {
    const [e] = vergleicheAngebote([basis], 120, "2027-01-01", []);
    expect(e.rate?.toFixed(2)).toBe("5000.00");
    expect(e.perioden).toBe(120);
    expect(e.tilgung!.plus(e.restschuld!).toFixed(2)).toBe("1000000.00");
    expect(e.gesamtkosten!.equals(e.zinsen!)).toBe(true);
    // ohne Gebühren entspricht der Effektivzins dem monatlich verzinsten Sollzins: (1 + 4/1200)^12 − 1
    expect(e.effektivzins?.toFixed(3)).toBe("4.074");
  });

  it("Gebühren und Disagio erhöhen Kosten und Effektivzins", () => {
    const [ohne, mit] = vergleicheAngebote([basis, { ...basis, id: "b", auszahlungProzent: dezimal("98"), bearbeitungsgebuehr: dezimal("5000") }], 120, "2027-01-01", []);
    expect(mit.gebuehren?.toFixed(2)).toBe("25000.00");
    expect(mit.gesamtkosten!.minus(ohne.gesamtkosten!).toFixed(2)).toBe("25000.00");
    expect(mit.effektivzins!.greaterThan(ohne.effektivzins!)).toBe(true);
  });

  it("lässt Kosten unbekannt statt 0", () => {
    const [kurz, ohneGebuehr, ohneZins] = vergleicheAngebote(
      [{ ...basis, zinsbindungMonate: 60 }, { ...basis, id: "c", bearbeitungsgebuehr: null }, { ...basis, id: "d", sollzins: null }],
      120,
      "2027-01-01",
      [],
    );
    expect(kurz.gesamtkosten).toBeNull();
    expect(kurz.luecken).toContain("zinsbindungKuerzer");
    expect(ohneGebuehr.gesamtkosten).toBeNull();
    expect(ohneGebuehr.zinsen).not.toBeNull();
    expect(ohneZins.zinsen).toBeNull();
    expect(ohneZins.luecken).toContain("zins");
  });

  it("variabel: Referenzzins am Stichtag plus Marge", () => {
    const [e] = vergleicheAngebote([{ ...basis, zinsArt: "VARIABEL", sollzins: null, referenzzins: "3M-EURIBOR", marge: dezimal("1.5") }], 60, "2027-01-01", [
      { referenz: "3M-EURIBOR", stichtag: "2026-10-01", satz: dezimal("2.1") },
    ]);
    expect(e.zinssatz?.toFixed(2)).toBe("3.60");
    expect(e.zinsHerkunft).toMatchObject({ art: "variabel", stichtag: "2026-10-01" });
    expect(vergleichsMonate([{ zinsbindungMonate: 120, laufzeitMonate: null }, { zinsbindungMonate: 60, laufzeitMonate: null }])).toBe(60);
  });
});
