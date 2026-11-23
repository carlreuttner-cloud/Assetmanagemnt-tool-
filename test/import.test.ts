/**
 * Import: CSV-Grundlagen und Kreditbuchungen aus den drei Test-Bankformaten.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { leseCsv, leseDatum, leseZahl } from "@/lib/import/csv";
import { buchungsSchluessel, erkenneArt, leseKreditbuchungen } from "@/lib/import/kreditbuchungen";
import { erzeugePortfolio } from "../prisma/testdaten/portfolio";

const ordner = join(__dirname, "..", "testdaten", "kreditbuchungen");
const p = erzeugePortfolio();

describe("CSV-Grundlagen", () => {
  it("liest Zahlen in deutscher und englischer Schreibweise", () => {
    expect(leseZahl("-16.750,15")!.toFixed(2)).toBe("-16750.15");
    expect(leseZahl("16750,15")!.toFixed(2)).toBe("16750.15");
    expect(leseZahl("16750.15")!.toFixed(2)).toBe("16750.15");
    expect(leseZahl("1.234")!.toFixed(0)).toBe("1234");
    expect(leseZahl("-5.746.000,62 EUR")!.toFixed(2)).toBe("-5746000.62");
    expect(leseZahl("12,50-")!.toFixed(2)).toBe("-12.50");
    expect(leseZahl("")).toBeNull();
    expect(leseZahl("abc")).toBeNull();
  });

  it("liest Datumsangaben", () => {
    expect(leseDatum("30.11.2024")).toBe("2024-11-30");
    expect(leseDatum("30.11.24")).toBe("2024-11-30");
    expect(leseDatum("2024-11-30")).toBe("2024-11-30");
    expect(leseDatum("1.2.2025")).toBe("2025-02-01");
    expect(leseDatum("31.02.2025")).toBeNull();
  });

  it("liest Felder mit Anführungszeichen, Trennzeichen und Zeilenumbrüchen", () => {
    expect(leseCsv('"a;b";"c ""d"""\r\n1;2')).toEqual([["a;b", 'c "d"'], ["1", "2"]]);
    expect(leseCsv("a,b,c\n1,2,3")).toEqual([["a", "b", "c"], ["1", "2", "3"]]);
  });

  it("erkennt Buchungsarten", () => {
    expect(erkenneArt("Darlehenszinsen")).toBe("ZINS");
    expect(erkenneArt("Zinsbelastung")).toBe("ZINS");
    expect(erkenneArt("INTEREST")).toBe("ZINS");
    expect(erkenneArt("Tilgungsleistung")).toBe("TILGUNG");
    expect(erkenneArt("PRINCIPAL")).toBe("TILGUNG");
    expect(erkenneArt("UNSCHEDULED_REPAYMENT")).toBe("SONDERTILGUNG");
    expect(erkenneArt("Sondertilgung")).toBe("SONDERTILGUNG");
    expect(erkenneArt("Bearbeitungsentgelt")).toBe("GEBUEHR");
    expect(erkenneArt("Valutierung")).toBe("AUSZAHLUNG");
    expect(erkenneArt("Irgendwas")).toBe("SONSTIGES");
  });
});

describe("Kreditbuchungen aus Bank-CSVs", () => {
  const dateien = readdirSync(ordner).filter((d) => d.endsWith(".csv"));

  it("findet alle 25 Testdateien", () => expect(dateien).toHaveLength(25));

  for (const datei of dateien) {
    it(`liest ${datei} vollständig und richtig`, () => {
      const ergebnis = leseKreditbuchungen(new Uint8Array(readFileSync(join(ordner, datei))));
      const kredit = p.kredite.find((k) => `${k.kreditnummer}.csv` === datei)!;
      expect(ergebnis.fehler).toEqual([]);
      expect(ergebnis.kreditnummer).toBe(kredit.kreditnummer);
      expect(ergebnis.iban).toBe(kredit.iban);
      const erwartet = kredit.buchungen;
      expect(ergebnis.buchungen.map(buchungsSchluessel).sort()).toEqual(erwartet.map(buchungsSchluessel).sort());
      for (const b of ergebnis.buchungen) {
        const soll = erwartet.find((e) => buchungsSchluessel(e) === buchungsSchluessel(b))!;
        expect(b.saldoNach?.toFixed(2)).toBe(soll.saldoNach?.toFixed(2));
      }
    });
  }

  it("meldet Dateien ohne erkennbare Tabelle", () => {
    const e = leseKreditbuchungen(new TextEncoder().encode("Name;Wert\nx;1"));
    expect(e.fehler[0].grund).toBe("kopfzeile");
  });

  it("meldet unlesbare Zeilen, statt sie stillschweigend zu überspringen", () => {
    const e = leseKreditbuchungen(new TextEncoder().encode("Datum;Art;Betrag\n31.01.2025;Zinsen;100,00\nkaputt;Zinsen;5\n28.02.2025;Tilgung;"));
    expect(e.buchungen).toHaveLength(1);
    expect(e.fehler.map((f) => f.grund)).toEqual(["datum", "betrag"]);
  });
});
