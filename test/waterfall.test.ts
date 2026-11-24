import { describe, expect, it } from "vitest";
import { dezimal } from "@/lib/geld";
import { rechneWaterfall, verzinsung, type WaterfallEingabe } from "@/lib/waterfall";

const d = dezimal;
function eingabe(teil: Partial<WaterfallEingabe> = {}): WaterfallEingabe {
  return {
    datum: "2026-01-01",
    verkaeufe: [{ hausId: "h", name: "Haus", preis: d(10_000_000), preisAnnahme: false }],
    verkaufskostenProzent: d(3),
    kredite: [{ id: "k", name: "Kredit", anteilProzent: d(100), restschuld: d(5_000_000), restschuldStichtag: "2025-12-31", vorfaelligkeit: d(100_000) }],
    steuern: d(200_000),
    gesellschafter: [
      { id: "a", name: "Investor", gewinnanteilProzent: d(80), bewegungen: [{ art: "EINLAGE", datum: "2021-01-01", betrag: d(2_000_000) }] },
      { id: "b", name: "Sponsor", gewinnanteilProzent: d(20), bewegungen: [{ art: "EINLAGE", datum: "2021-01-01", betrag: d(500_000) }] },
    ],
    vertrag: { vorzugsrenditeProzent: d(6), verzinsung: "EINFACH", ausschuettungenAnrechnen: true },
    ...teil,
  };
}

describe("Verkaufs-Waterfall", () => {
  it("Vorzugsrendite einfach und mit Zinseszins (Act/365)", () => {
    expect(verzinsung(d(1000), "2025-01-01", "2026-01-01", d(6), "EINFACH").toFixed(2)).toBe("60.00");
    expect(verzinsung(d(1000), "2024-01-01", "2026-01-01", d(10), "ZINSESZINS").toFixed(0)).toBe("210");
  });

  it("verteilt den Netto-Erlös in drei Stufen", () => {
    const e = rechneWaterfall(eingabe());
    // 10 Mio. − 300.000 − 5 Mio. − 100.000 − 200.000
    expect(e.nettoErloes!.toFixed()).toBe("4400000");
    expect(e.stufen.rueckzahlung!.toFixed()).toBe("2500000");
    // 2,5 Mio. × 6 % × 1826/365 Tage
    expect(e.stufen.vorzugsrendite!.toFixed(2)).toBe("750410.96");
    const rest = d(4_400_000).minus(2_500_000).minus(e.stufen.vorzugsrendite!);
    expect(e.stufen.gewinn!.toFixed(2)).toBe(rest.toFixed(2));
    const [inv, sp] = e.gesellschafter;
    expect(inv.summe!.plus(sp.summe!).toFixed(2)).toBe("4400000.00");
    expect(e.luecken).toEqual([]);
  });

  it("schätzt nichts: fehlende Vorfälligkeit macht den Netto-Erlös unbekannt", () => {
    const e = rechneWaterfall(eingabe({ kredite: [{ id: "k", name: "K1", anteilProzent: d(100), restschuld: d(5_000_000), restschuldStichtag: null, vorfaelligkeit: null }] }));
    expect(e.nettoErloes).toBeNull();
    expect(e.stufen.rueckzahlung).toBeNull();
    expect(e.luecken).toContainEqual({ art: "vorfaelligkeit", bezug: "K1" });
  });

  it("ohne Vertragsregeln keine Verteilung", () => {
    const e = rechneWaterfall(eingabe({ vertrag: null }));
    expect(e.nettoErloes).not.toBeNull();
    expect(e.gesellschafter.every((g) => g.summe === null)).toBe(true);
    expect(e.luecken).toContainEqual({ art: "vertrag" });
  });

  it("Gesellschafter ohne Einzahlungen und Gewinnanteile ≠ 100 % sind Lücken", () => {
    const e = rechneWaterfall(
      eingabe({
        gesellschafter: [
          { id: "a", name: "A", gewinnanteilProzent: d(70), bewegungen: [{ art: "EINLAGE", datum: "2021-01-01", betrag: d(1) }] },
          { id: "b", name: "B", gewinnanteilProzent: d(20), bewegungen: [] },
        ],
      }),
    );
    expect(e.luecken).toContainEqual({ art: "einzahlungen", bezug: "B" });
    expect(e.luecken).toContainEqual({ art: "gewinnanteile" });
    expect(e.stufen.rueckzahlung).toBeNull();
  });

  it("Unterdeckung: Erlös reicht nicht für die Einlagen", () => {
    const e = rechneWaterfall(eingabe({ verkaeufe: [{ hausId: "h", name: "Haus", preis: d(7_000_000), preisAnnahme: false }] }));
    expect(e.unterdeckung).toBe(true);
    expect(e.stufen.rueckzahlung!.toFixed()).toBe(e.nettoErloes!.toFixed());
    expect(e.stufen.vorzugsrendite!.toFixed()).toBe("0");
  });

  it("Ausschüttungen werden auf die Vorzugsrendite angerechnet", () => {
    const mit = eingabe();
    mit.gesellschafter[0].bewegungen.push({ art: "AUSSCHUETTUNG", datum: "2024-01-01", betrag: d(100_000) });
    const e = rechneWaterfall(mit);
    const ohne = rechneWaterfall(eingabe());
    expect(ohne.gesellschafter[0].offeneVorzugsrendite!.minus(e.gesellschafter[0].offeneVorzugsrendite!).toFixed()).toBe("100000");
  });
});
