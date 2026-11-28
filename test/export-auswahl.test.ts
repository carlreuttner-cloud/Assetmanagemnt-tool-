import { describe, expect, it } from "vitest";
import { texte } from "@/i18n";
import { abkuerzungenIn, alleAn, auswahlBeschreibung, pruefeAuswahl, type ExportTabelleInfo } from "@/lib/export-auswahl";

const t = texte().exportAuswahl.regeln;
const tabellen: ExportTabelleInfo[] = [
  { id: "t0", blatt: "Häuser", spalten: ["Bezeichnung", "LTV", "Soll-Miete – Monat", "Soll-Miete – Jahr"] },
  { id: "t1", blatt: "Kredite", spalten: ["Kredit", "Restschuld"] },
];

describe("Auswahl vor dem Excel-Export", () => {
  it("alles an ist stimmig bis auf den Glossar-Hinweis", () => {
    const h = pruefeAuswahl(tabellen, ["Verkehrswert"], alleAn(tabellen, true), ["LTV", "DSCR"], t);
    expect(h).toHaveLength(1);
    expect(h[0].text).toContain("LTV");
    const mitGlossar = { ...alleAn(tabellen, true), glossar: true };
    expect(pruefeAuswahl(tabellen, [], mitGlossar, ["LTV"], t)).toEqual([]);
  });

  it("warnt bei Monatsmiete ohne Jahresmiete und fehlender Bezeichnung", () => {
    const a = alleAn(tabellen, false);
    a.glossar = true;
    a.tabellen.t0.spalten = [false, true, true, false];
    const h = pruefeAuswahl(tabellen, [], a, ["LTV"], t);
    expect(h.map((x) => x.art)).toEqual(["hinweis", "warnung"]);
    expect(h[1].text).toContain("Soll-Miete");
    expect(h[1].text).toContain("Jahr");
  });

  it("meldet leere Auswahl und Tabellen ohne Spalten", () => {
    const a = alleAn(tabellen, false);
    a.tabellen.t0.an = false;
    a.tabellen.t1.spalten = [false, false];
    expect(pruefeAuswahl(tabellen, [], a, [], t)).toEqual([{ art: "warnung", text: t.leer }]);
    a.tabellen.t0.an = true;
    expect(pruefeAuswahl(tabellen, [], a, [], t).some((x) => x.text.includes("Kredite"))).toBe(true);
  });

  it("findet Abkürzungen nur als eigenes Wort", () => {
    expect(abkuerzungenIn(["DSCR / ICR", "Verkehrswert"], ["DSCR", "ICR", "LTV"])).toEqual(["DSCR", "ICR"]);
    expect(abkuerzungenIn(["SALTVAL"], ["LTV"])).toEqual([]);
  });

  it("übergibt der KI nur Namen, keine Werte", () => {
    const a = alleAn(tabellen, true);
    a.tabellen.t1.an = false;
    const b = auswahlBeschreibung("Häuser", tabellen, ["Verkehrswert"], a);
    expect(b.tabellen[1]).toEqual({ blatt: "Kredite", exportiert: false, gewaehlt: [], weggelassen: ["Kredit", "Restschuld"] });
    expect(JSON.stringify(b)).not.toMatch(/\d{3}/);
  });
});
