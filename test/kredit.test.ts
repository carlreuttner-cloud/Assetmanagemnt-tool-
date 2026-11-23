import { describe, expect, it } from "vitest";
import { dezimal } from "@/lib/geld";
import { hausKennzahlen, gruppenKennzahlen, covenantKennzahlen } from "@/lib/kennzahlen";
import {
  berechneTilgungsplan,
  kapitaldienstJahr,
  pruefeCovenant,
  restschuld,
  sortiereBuchungen,
  zinsbindung,
  zinssatz,
  type KreditDaten,
} from "@/lib/kredit";
import { erzeugePortfolio, kennzahlen, STICHTAG } from "../prisma/testdaten/portfolio";
import { alsDaten } from "./hilfen/testportfolio";

const p = erzeugePortfolio();
const soll = kennzahlen(p);
const { haeuser, kredite } = alsDaten(p);

describe("Restschuld und Kennzahlen gegen die Sollwerte der Testdaten", () => {
  it("Restschuld je Kredit am Stichtag entspricht dem Generator", () => {
    for (const k of p.kredite) {
      const daten = kredite.find((x) => x.id === k.schluessel)!;
      expect(restschuld(daten, STICHTAG).toFixed(2), k.schluessel).toBe(k.restschuldStichtag.toFixed(2));
    }
  });

  it("Miete, Leerstand, Restschuld und LTV je Haus stimmen", () => {
    for (const s of soll) {
      const h = haeuser.find((x) => x.id === s.haus)!;
      const ist = hausKennzahlen(h, kredite, [], STICHTAG);
      expect(ist.sollMonat.toFixed(2), s.haus).toBe(s.sollMonat.toFixed(2));
      expect(ist.istMonat.toFixed(2), s.haus).toBe(s.istMonat.toFixed(2));
      expect(ist.erwartetLeerMonat.toFixed(2), s.haus).toBe(s.erwartetLeerMonat.toFixed(2));
      expect(ist.leerstandQuote!.toFixed(4), s.haus).toBe(s.leerstandProzent.toFixed(4));
      expect(ist.restschuld.toFixed(2), s.haus).toBe(s.restschuld.toFixed(2));
      expect(ist.ltv!.toFixed(4), s.haus).toBe(s.ltv.toFixed(4));
      expect(ist.kaufpreisfaktor!.toFixed(4), s.haus).toBe(s.faktor.toFixed(4));
    }
  });

  it("Portfolio-Restschuld = Summe der Kredite = Summe der anteiligen Hausschulden", () => {
    const gesamt = gruppenKennzahlen(haeuser, kredite, [], STICHTAG);
    const summeHaeuser = soll.reduce((s, x) => s.plus(x.restschuld), dezimal(0));
    expect(gesamt.restschuld.toFixed(2)).toBe(summeHaeuser.toFixed(2));
    expect(gesamt.haeuser).toBe(15);
    expect(gesamt.sollJahr.toFixed(2)).toBe(gesamt.sollMonat.times(12).toFixed(2));
  });

  it("erkennt die Covenant-Verletzung bei K12 (LTV höchstens 65 %)", () => {
    const k12 = kredite.find((k) => k.id === "K12")!;
    const werte = covenantKennzahlen(k12, haeuser, kredite, [], STICHTAG);
    const ergebnis = pruefeCovenant({ kennzahl: "LTV", vergleich: "HOECHSTENS", schwellenwert: dezimal(65) }, { LTV: werte.ltv });
    expect(ergebnis.eingehalten).toBe(false);
    expect(ergebnis.wert!.greaterThan(65)).toBe(true);
  });

  it("Kapitaldienst der letzten 12 Monate aus den Buchungen", () => {
    const k01 = kredite.find((k) => k.id === "K01")!;
    const kd = kapitaldienstJahr(k01, [], STICHTAG);
    expect(kd.quelle).toBe("buchungen");
    // monatliche Annuität: 12 Raten
    expect(kd.summe.toFixed(2)).toBe(k01.ratenbetrag!.times(12).toFixed(2));
  });
});

describe("Kreditfunktionen", () => {
  const basis: KreditDaten = {
    id: "x", gesellschaftId: "g", bezeichnung: "Test", zinsArt: "VARIABEL", sollzins: null, referenzzins: "3M-EURIBOR",
    marge: dezimal("1.5"), ursprungsbetrag: dezimal(1_000_000), auszahlungsdatum: "2020-01-01", zinsbindungBis: null,
    laufzeitBis: null, zahlweise: "MONATLICH", tilgungsart: "ANNUITAET", anfaenglicheTilgung: dezimal(2), ratenbetrag: null,
    haeuser: [], buchungen: [], tilgungsplaene: [],
  };

  it("variabler Zins: Referenzzins mit Floor 0 % plus Marge", () => {
    const werte = [
      { referenz: "3M-EURIBOR", stichtag: "2021-01-01", satz: dezimal("-0.55") },
      { referenz: "3M-EURIBOR", stichtag: "2024-01-01", satz: dezimal("3.93") },
    ];
    expect(zinssatz(basis, werte, "2021-06-30")!.toFixed(2)).toBe("1.50");
    expect(zinssatz(basis, werte, "2024-06-30")!.toFixed(2)).toBe("5.43");
    expect(zinssatz(basis, werte, "2019-01-01")).toBeNull();
  });

  it("ohne Buchungen: Restschuld = Ursprungsbetrag, vor Auszahlung 0", () => {
    expect(restschuld(basis, "2025-01-01").toFixed(2)).toBe("1000000.00");
    expect(restschuld(basis, "2019-12-31").toFixed(2)).toBe("0.00");
  });

  it("Buchungen am selben Tag: Tilgung nach Zins", () => {
    const sortiert = sortiereBuchungen([
      { datum: "2025-01-31", art: "TILGUNG" as const },
      { datum: "2025-01-31", art: "ZINS" as const },
      { datum: "2024-12-31", art: "TILGUNG" as const },
    ]);
    expect(sortiert.map((b) => `${b.datum} ${b.art}`)).toEqual(["2024-12-31 TILGUNG", "2025-01-31 ZINS", "2025-01-31 TILGUNG"]);
  });

  it("Zinsbindung: Stufen nach Restlaufzeit", () => {
    const fest = { zinsArt: "FEST" as const };
    expect(zinsbindung({ ...fest, zinsbindungBis: "2026-11-30" }, "2026-11-23").stufe).toBe("unter12");
    expect(zinsbindung({ ...fest, zinsbindungBis: "2028-06-30" }, "2026-11-23").stufe).toBe("unter24");
    expect(zinsbindung({ ...fest, zinsbindungBis: "2025-06-30" }, "2026-11-23").stufe).toBe("abgelaufen");
    expect(zinsbindung({ zinsArt: "VARIABEL", zinsbindungBis: null }, "2026-11-23").stufe).toBe("keine");
  });

  it("Annuitätenplan: konstante Rate, Restschuld sinkt, Zins + Tilgung = Rate", () => {
    const zeilen = berechneTilgungsplan({
      saldo: dezimal(100_000), ab: "2026-01-01", zinssatz: dezimal(3), zahlweise: "MONATLICH",
      tilgungsart: "ANNUITAET", tilgungProzent: dezimal(2), bis: "2026-12-31",
    });
    expect(zeilen).toHaveLength(12);
    expect(zeilen[0].faelligAm).toBe("2026-01-31");
    expect(zeilen[0].zins.toFixed(2)).toBe("250.00");
    expect(zeilen[0].rate.toFixed(2)).toBe("416.67");
    for (const z of zeilen) expect(z.zins.plus(z.tilgung).toFixed(2)).toBe("416.67");
    expect(zeilen[11].restschuld.lessThan(zeilen[0].restschuld)).toBe(true);
  });

  it("Plan bis zur vollständigen Tilgung endet bei 0", () => {
    const zeilen = berechneTilgungsplan({
      saldo: dezimal(10_000), ab: "2026-01-01", zinssatz: dezimal(5), zahlweise: "QUARTALSWEISE",
      tilgungsart: "RATENTILGUNG", ratenbetrag: dezimal(1000),
    });
    expect(zeilen).toHaveLength(10);
    expect(zeilen[0].faelligAm).toBe("2026-03-31");
    expect(zeilen[9].restschuld.toFixed(2)).toBe("0.00");
  });
});
