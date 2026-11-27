import { describe, expect, it } from "vitest";
import { texte } from "@/i18n";
import { nachMonat, naechsteMieterhoehung, sammleFristen, type FristEingabe } from "@/lib/fristen";
import { pfadPasst } from "@/lib/lesezeichen";

const t = texte().fristen;
const datum = (d: string) => d;

describe("Mieterhöhung nach § 558 BGB", () => {
  it("rechnet 12 Monate bis zum Verlangen und 15 bis zur Wirksamkeit ab der letzten Erhöhung", () => {
    expect(naechsteMieterhoehung({ einheitArt: "WOHNUNG", beginn: "2020-03-01", letzteMieterhoehung: "2025-01-31" })).toEqual({
      art: "moeglich", verlangenAb: "2026-01-31", wirksamAb: "2026-04-30", basis: "letzteErhoehung", basisDatum: "2025-01-31",
    });
  });
  it("nimmt den Mietbeginn, wenn keine Erhöhung erfasst ist", () => {
    expect(naechsteMieterhoehung({ einheitArt: "WOHNUNG", beginn: "2026-02-01", letzteMieterhoehung: null })).toMatchObject({ verlangenAb: "2027-02-01", basis: "mietbeginn" });
  });
  it("schätzt bei Gewerbe nichts", () => {
    expect(naechsteMieterhoehung({ einheitArt: "GEWERBE", beginn: "2020-01-01", letzteMieterhoehung: null })).toEqual({ art: "unbekannt", grund: "gewerbe" });
  });
});

describe("Fristen-Kalender", () => {
  const e: FristEingabe = {
    kredite: [
      { id: "k1", bezeichnung: "K1", gesellschaftId: "g", gesellschaft: "G", zinsArt: "FEST", zinsbindungBis: "2027-03-14", laufzeitBis: "2035-12-31" },
      { id: "k2", bezeichnung: "K2", gesellschaftId: "g", gesellschaft: "G", zinsArt: "VARIABEL", zinsbindungBis: "2026-12-31", laufzeitBis: null },
    ],
    mietverhaeltnisse: [
      { id: "m1", mieter: "A", einheit: "WE 1", einheitArt: "WOHNUNG", haus: "H", gesellschaftId: "g", beginn: "2020-01-01", ende: null, letzteMieterhoehung: "2026-06-01" },
      { id: "m2", mieter: "B", einheit: "WE 2", einheitArt: "WOHNUNG", haus: "H", gesellschaftId: "g", beginn: "2015-01-01", ende: "2026-01-31", letzteMieterhoehung: null },
      { id: "m3", mieter: "C", einheit: "GE 1", einheitArt: "GEWERBE", haus: "H", gesellschaftId: "g", beginn: "2019-01-01", ende: "2027-06-30", letzteMieterhoehung: null },
      { id: "m4", mieter: "D", einheit: "WE 3", einheitArt: "WOHNUNG", haus: "H", gesellschaftId: "g", beginn: "2018-01-01", ende: null, letzteMieterhoehung: null },
    ],
  };

  it("sammelt Zinsbindung (nur Festzins), Vertragsende und Mieterhöhung im Zeitraum", () => {
    const { fristen, luecken } = sammleFristen(e, "2026-11-27", "2027-11-27", t, datum);
    expect(fristen.map((f) => `${f.art}:${f.titel}:${f.datum}`)).toEqual([
      "mieterhoehung:WE 3 · H:2019-01-01",
      "zinsbindung:K1:2027-03-14",
      "mietende:GE 1 · H:2027-06-30",
      "mieterhoehung:WE 1 · H:2027-06-01",
    ].sort((a, b) => a.split(":")[2].localeCompare(b.split(":")[2])));
    // beendetes Mietverhältnis m2 fehlt, Kreditende 2035 liegt außerhalb, Gewerbe ist eine Lücke
    expect(luecken.map((l) => l.titel)).toEqual(["GE 1 · H"]);
  });

  it("trennt Fälliges von kommenden Monaten", () => {
    const { fristen } = sammleFristen(e, "2026-11-27", null, t, datum);
    const { faellig, monate } = nachMonat(fristen, "2026-11-27");
    expect(faellig.map((f) => f.titel)).toEqual(["WE 3 · H"]);
    expect(monate.map(([m]) => m)).toEqual(["2027-03", "2027-06", "2035-12"]);
  });
});

describe("Lesezeichen", () => {
  it("akzeptiert nur passende Pfade je Art", () => {
    expect(pfadPasst("haus", "/haeuser/abc-123")).toBe(true);
    expect(pfadPasst("haus", "/haeuser/abc/bearbeiten")).toBe(false);
    expect(pfadPasst("kredit", "/gesellschaften/kredite/x1")).toBe(true);
    expect(pfadPasst("mieter", "https://boese.example/x")).toBe(false);
    expect(pfadPasst("unbekannt", "/haeuser/x")).toBe(false);
  });
});
