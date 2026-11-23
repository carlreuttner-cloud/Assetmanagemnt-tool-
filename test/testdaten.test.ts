/**
 * Prüft, dass der Testdatensatz die fachlichen Vorgaben einhält und die eingecheckten
 * CSV-Dateien unter testdaten/ zum Generator passen.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { dezimal } from "@/lib/geld";
import { csvDateien } from "../prisma/testdaten/bankformate";
import { ibanIstGueltig, monatsNummer } from "../prisma/testdaten/hilfen";
import { aktiveMietverhaeltnisse, BANKEN, BUCHUNGEN_AB, erzeugePortfolio, kennzahlen, STICHTAG } from "../prisma/testdaten/portfolio";

const p = erzeugePortfolio();
const zahlen = kennzahlen(p);
const zwischen = (wert: { toFixed(): string }, min: number, max: number) =>
  dezimal(wert).greaterThanOrEqualTo(min) && dezimal(wert).lessThanOrEqualTo(max);

describe("Testdaten: Struktur und Werte", () => {
  it("hat 5 Gesellschaften mit je 3 Häusern", () => {
    expect(p.gesellschaften).toHaveLength(5);
    for (const g of p.gesellschaften) expect(p.haeuser.filter((h) => h.gesellschaft === g.schluessel)).toHaveLength(3);
  });

  it("hat Verkehrswerte von 8 bis 20 Mio. € in runden Werten, Kaufpreise darunter", () => {
    const werte = zahlen.map((k) => k.verkehrswert);
    expect(werte.some((w) => w.equals(8_000_000))).toBe(true);
    expect(werte.some((w) => w.equals(20_000_000))).toBe(true);
    for (const k of zahlen) {
      expect(zwischen(k.verkehrswert, 8_000_000, 20_000_000)).toBe(true);
      expect(k.verkehrswert.modulo(100_000).isZero()).toBe(true);
      expect(k.kaufpreis.lessThan(k.verkehrswert)).toBe(true);
      expect(k.kaufpreis.greaterThan(k.verkehrswert.times("0.85"))).toBe(true);
    }
  });

  it("leitet die Miete aus einem Kaufpreisfaktor von 18 bis 25 ab", () => {
    for (const k of zahlen) {
      expect(zwischen(k.faktor, 18, 25), `${k.haus}: Faktor ${k.faktor.toFixed(2)}`).toBe(true);
      expect(zwischen(k.bruttoanfangsrendite, 4, 5.6)).toBe(true);
      expect(zwischen(k.mieteProM2, 8, 25), `${k.haus}: ${k.mieteProM2.toFixed(2)} €/m²`).toBe(true);
    }
  });

  it("hat 30 bis 80 Einheiten je Haus und 5 Häuser mit Gewerbe", () => {
    for (const k of zahlen) expect(k.einheiten).toBeGreaterThanOrEqual(30);
    for (const k of zahlen) expect(k.einheiten).toBeLessThanOrEqual(80);
    expect(zahlen.filter((k) => k.gewerbe > 0)).toHaveLength(5);
  });

  it("hat etwa die Hälfte der Häuser ohne Leerstand, die übrigen mit 5 bis 15 %", () => {
    const ohne = zahlen.filter((k) => k.leerstandProzent.isZero());
    expect(ohne.length).toBeGreaterThanOrEqual(7);
    expect(ohne.length).toBeLessThanOrEqual(8);
    for (const k of zahlen.filter((x) => !x.leerstandProzent.isZero())) {
      expect(zwischen(k.leerstandProzent, 5, 15), `${k.haus}: ${k.leerstandProzent.toFixed(1)} %`).toBe(true);
    }
  });

  it("hat je Haus günstige Altmieter, Rückstände, Ist ≠ Soll und verschiedene Mieterhöhungsdaten", () => {
    for (const h of p.haeuser) {
      const aktiv = h.einheiten.filter((e) => e.art === "WOHNUNG").flatMap((e) => aktiveMietverhaeltnisse(e).map((m) => ({ e, m })));
      const flaeche = aktiv.reduce((s, x) => s.plus(x.e.flaeche), dezimal(0));
      const miete = aktiv.reduce((s, x) => s.plus(x.m.sollMiete), dezimal(0));
      const schnitt = miete.dividedBy(flaeche);
      const guenstig = aktiv.filter((x) => x.m.sollMiete.dividedBy(x.e.flaeche).lessThan(schnitt.times("0.8")));
      expect(guenstig.length, h.schluessel).toBeGreaterThanOrEqual(2);

      const alle = h.einheiten.flatMap(aktiveMietverhaeltnisse);
      expect(alle.filter((m) => m.rueckstand.greaterThan(0)).length).toBeGreaterThanOrEqual(2);
      expect(alle.some((m) => m.istMiete.lessThan(m.sollMiete))).toBe(true);
      expect(new Set(alle.map((m) => m.letzteMieterhoehung)).size).toBeGreaterThanOrEqual(5);
      for (const m of alle) expect(m.istMiete.lessThanOrEqualTo(m.sollMiete)).toBe(true);
    }
  });

  it("hat für jede leere Einheit eine erwartete Miete (Soll-Miete für Leerstand)", () => {
    for (const e of p.haeuser.flatMap((h) => h.einheiten)) {
      const leer = aktiveMietverhaeltnisse(e).length === 0;
      expect(e.erwarteteMiete !== null, e.bezeichnung).toBe(leer);
      if (e.erwarteteMiete) expect(e.erwarteteMiete.greaterThan(0)).toBe(true);
    }
  });
});

describe("Testdaten: Kredite", () => {
  it("hat 1 bis 3 Kredite je Haus, ein Haus mit 2 Krediten und einen gemeinsamen Kredit nach Kaufpreis", () => {
    for (const k of zahlen) expect(k.kredite).toBeGreaterThanOrEqual(1);
    for (const k of zahlen) expect(k.kredite).toBeLessThanOrEqual(3);
    expect(zahlen.some((k) => k.kredite === 2)).toBe(true);

    const gemeinsam = p.kredite.filter((k) => k.haeuser.length === 2);
    expect(gemeinsam.length).toBeGreaterThanOrEqual(1);
    for (const k of gemeinsam) {
      const [a, b] = k.haeuser;
      expect(a.anteilProzent.plus(b.anteilProzent).equals(100)).toBe(true);
      const kpA = p.haeuser.find((h) => h.schluessel === a.haus)!.kaufpreis;
      const kpB = p.haeuser.find((h) => h.schluessel === b.haus)!.kaufpreis;
      expect(a.anteilProzent.minus(kpA.times(100).dividedBy(kpA.plus(kpB))).abs().lessThan("0.000001")).toBe(true);
    }
  });

  it("hält den LTV je Haus zwischen 50 und 70 %", () => {
    for (const k of zahlen) expect(zwischen(k.ltv, 50, 70), `${k.haus}: LTV ${k.ltv.toFixed(2)}`).toBe(true);
  });

  it("mischt feste und variable Kredite (3M und 6M), einige Zinsbindungen enden in 2 Jahren", () => {
    expect(p.kredite.some((k) => k.zinsArt === "FEST")).toBe(true);
    expect(p.kredite.some((k) => k.referenzzins === "3M-EURIBOR")).toBe(true);
    expect(p.kredite.some((k) => k.referenzzins === "6M-EURIBOR")).toBe(true);
    const bald = p.kredite.filter((k) => k.zinsbindungBis && k.zinsbindungBis > "2026-11-23" && k.zinsbindungBis <= "2028-11-23");
    expect(bald.length).toBeGreaterThanOrEqual(3);
    expect(new Set(p.kredite.map((k) => k.zinsbindungBis)).size).toBeGreaterThan(10);
  });

  it("hat gültige, als Test erkennbare IBANs", () => {
    for (const k of p.kredite) {
      expect(ibanIstGueltig(k.iban), k.iban).toBe(true);
      expect(k.iban.slice(4, 8)).toBe("9999");
    }
    expect(new Set(p.kredite.map((k) => k.iban)).size).toBe(p.kredite.length);
  });

  it("hat 24 Monate Buchungen mit stimmigem Kontostand", () => {
    const monate = monatsNummer(STICHTAG) - monatsNummer(BUCHUNGEN_AB) + 1;
    expect(monate).toBe(24);
    for (const k of p.kredite) {
      const termine = new Set(k.buchungen.map((b) => b.datum));
      expect([8, 24], k.schluessel).toContain(termine.size);
      let saldo = k.saldoVorZeitraum;
      for (const b of k.buchungen) {
        if (b.art !== "ZINS") saldo = saldo.minus(b.betrag);
        expect(b.saldoNach.equals(saldo), `${k.schluessel} ${b.datum} ${b.art}`).toBe(true);
        expect(b.betrag.greaterThan(0)).toBe(true);
      }
      expect(saldo.equals(k.restschuldStichtag)).toBe(true);
    }
  });

  it("hat einen nach Nachverhandlung geänderten Tilgungsplan", () => {
    const geaendert = p.kredite.filter((k) => k.tilgungsplaene.some((t) => t.version === 2));
    expect(geaendert.length).toBeGreaterThanOrEqual(1);
    const nv = p.kredite.find((k) => k.tilgungsplaene.some((t) => t.bezeichnung.includes("Nachverhandlung")))!;
    const [alt, neu] = nv.tilgungsplaene;
    expect(alt.zeilen[0].rate.equals(neu.zeilen[0].rate)).toBe(false);
  });
});

describe("Testdaten: CSV-Dateien", () => {
  it("nutzt drei Bankformate", () => {
    expect(new Set(p.kredite.map((k) => BANKEN[k.bank].format))).toEqual(new Set(["A", "B", "C"]));
  });

  it("stimmen mit den eingecheckten Dateien überein (sonst `npm run testdaten:csv`)", () => {
    for (const datei of csvDateien(p)) {
      const eingecheckt = readFileSync(join(__dirname, "..", "testdaten", datei.pfad));
      expect(eingecheckt.equals(datei.inhalt), datei.pfad).toBe(true);
    }
  });
});
