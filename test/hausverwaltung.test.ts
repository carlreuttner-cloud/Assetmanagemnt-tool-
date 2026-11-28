import { describe, expect, it } from "vitest";
import { dezimal } from "../src/lib/geld";
import { entgangenSeit, entwicklung, haeuserAm, leerSeit, ueberschneidet, zuordnungAm, type StandFuerEntwicklung, type Zuordnung } from "../src/lib/hausverwaltung";
import type { StandZeile } from "../src/lib/mieterstand";

const zuordnungen: Zuordnung[] = [
  { id: "1", hausId: "h1", hausverwaltungId: "A", von: "2019-01-01", bis: "2026-08-31" },
  { id: "2", hausId: "h1", hausverwaltungId: "B", von: "2026-09-01", bis: null },
  { id: "3", hausId: "h2", hausverwaltungId: "A", von: "2019-01-01", bis: null },
];

const zeile = (einheit: string, leer: boolean, flaeche = 50, erwartet: number | null = 500): StandZeile => ({
  schluessel: einheit, einheit, art: "WOHNUNG", flaeche: dezimal(flaeche), leer, mieter: leer ? null : "M", beginn: null, ende: null,
  sollMiete: leer ? null : dezimal(500), istMiete: leer ? null : dezimal(500), nebenkosten: null, erwarteteMiete: leer && erwartet ? dezimal(erwartet) : null,
});
const stand = (hausId: string, stichtag: string, zeilen: StandZeile[], art: StandFuerEntwicklung["art"] = "VOLLSTAENDIG"): StandFuerEntwicklung => ({ id: `${hausId}${stichtag}`, hausId, stichtag, erstelltAm: `${stichtag}T00:00:00Z`, art, zeilen });

describe("Hausverwaltungen", () => {
  it("findet die Hausverwaltung zum Stichtag und bildet den Wechsel ab", () => {
    expect(zuordnungAm(zuordnungen, "h1", "2026-08-31")?.hausverwaltungId).toBe("A");
    expect(zuordnungAm(zuordnungen, "h1", "2026-09-01")?.hausverwaltungId).toBe("B");
    expect(zuordnungAm(zuordnungen, "h3", "2026-09-01")).toBeNull();
    expect(haeuserAm(zuordnungen, "A", "2026-10-01")).toEqual(["h2"]);
    expect(haeuserAm(zuordnungen, "A", "2026-06-01")).toEqual(["h1", "h2"]);
  });

  it("erkennt Überschneidungen je Haus", () => {
    expect(ueberschneidet({ hausId: "h1", hausverwaltungId: "C", von: "2026-10-01", bis: null }, zuordnungen)?.id).toBe("2");
    expect(ueberschneidet({ hausId: "h1", hausverwaltungId: "C", von: "2018-01-01", bis: "2018-12-31" }, zuordnungen)).toBeNull();
    expect(ueberschneidet({ hausId: "h3", hausverwaltungId: "C", von: "2026-10-01", bis: null }, zuordnungen)).toBeNull();
  });

  it("bestimmt den Leerstandsbeginn aus Mietende oder Ständen", () => {
    expect(leerSeit(["2026-06-30", null], [], "2026-11-28")).toEqual({ datum: "2026-07-01", art: "vertragsende", monate: 4 });
    const staende = [
      { stichtag: "2026-07-31", leer: false },
      { stichtag: "2026-08-31", leer: true },
      { stichtag: "2026-09-30", leer: true },
      { stichtag: "2026-10-31", leer: true },
    ];
    expect(leerSeit([], staende, "2026-11-28")).toEqual({ datum: "2026-08-31", art: "spaetestens", monate: 3 });
    expect(leerSeit([], [{ stichtag: "2026-10-31", leer: null }], "2026-11-28")).toBeNull();
    expect(entgangenSeit(dezimal(650), { datum: "2026-07-01", art: "vertragsende", monate: 4 })?.toString()).toBe("2600");
    expect(entgangenSeit(null, { datum: "2026-07-01", art: "vertragsende", monate: 4 })).toBeNull();
  });

  it("rechnet die Leerstandsentwicklung je Hausverwaltung nur für betreute Zeiträume", () => {
    const staende = [
      stand("h1", "2026-08-31", [zeile("1", true), zeile("2", false)]),
      stand("h1", "2026-09-30", [zeile("1", true), zeile("2", true)]),
      stand("h2", "2026-08-31", [zeile("1", false), zeile("2", false)]),
      stand("h2", "2026-09-30", [zeile("1", true, 50, null), zeile("2", false)]),
    ];
    const a = entwicklung(staende, { zuordnungen, hausverwaltungId: "A" });
    expect(a.map((p) => [p.stichtag, p.haeuser, p.summen.leerFlaeche.wert?.toString(), p.summen.leerQuote.wert?.toString()])).toEqual([
      ["2026-08-31", 2, "50", "25"],
      ["2026-09-30", 1, "50", "50"],
    ]);
    // erwartete Miete fehlt: entgangene Miete unvollständig, nicht 0
    expect(a[1].summen.entgangenMonat.unvollstaendig).toBe(true);
    const b = entwicklung(staende, { zuordnungen, hausverwaltungId: "B" });
    expect(b.map((p) => p.stichtag)).toEqual(["2026-09-30"]);
    expect(b[0].summen.leerQuote.wert?.toString()).toBe("100");
  });

  it("nutzt für Stände mit nur Leerstandsdaten die Gesamtfläche aus den Stammdaten", () => {
    const p = entwicklung([stand("h2", "2025-12-31", [zeile("1", true, 60)], "NUR_LEERSTAND")], { flaecheJeHaus: new Map([["h2", dezimal(600)]]) });
    expect(p[0].summen.leerQuote.wert?.toString()).toBe("10");
    expect(p[0].summen.istMonat.wert).toBeNull();
    expect(p[0].nurLeerstand).toBe(true);
    // ohne Stammdaten: Fläche aus den Zeilen des Stands (dort stehen alle Einheiten des Hauses)
    const z = entwicklung([stand("h2", "2025-12-31", [zeile("1", true, 60), { ...zeile("2", false, 40), leer: null }], "NUR_LEERSTAND")]);
    expect(z[0].summen.leerQuote.wert?.toString()).toBe("60");
    expect(z[0].summen.leerQuote.unvollstaendig).toBe(true);
  });
});
