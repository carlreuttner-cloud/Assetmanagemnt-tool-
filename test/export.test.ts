import { describe, expect, it } from "vitest";
import { blattName, dateiName, prozentAlsAnteil, zellwert } from "@/lib/export";

describe("Excel-Export: Zellwerte", () => {
  it("erkennt Beträge, Prozente, Flächen, Zahlen und Daten im deutschen Format", () => {
    expect(zellwert("8.193.685,59 €")).toEqual({ typ: "zahl", dezimal: "8193685.59", format: '#,##0.00 "€"' });
    expect(zellwert("210.000.000 €")).toEqual({ typ: "zahl", dezimal: "210000000", format: '#,##0 "€"' });
    expect(zellwert("-1.234,5 €")).toMatchObject({ dezimal: "-1234.5" });
    expect(zellwert("59,8 %")).toEqual({ typ: "zahl", dezimal: "0.598", format: "0.0%" });
    expect(zellwert("2.709 m²")).toMatchObject({ dezimal: "2709", format: '#,##0 "m²"' });
    expect(zellwert("1,26")).toMatchObject({ typ: "zahl", dezimal: "1.26" });
    expect(zellwert("38")).toMatchObject({ dezimal: "38" });
    expect(zellwert("31.10.2026")).toEqual({ typ: "datum", iso: "2026-10-31" });
  });

  it("lässt Texte, IBANs und unbekannte Werte als Text", () => {
    expect(zellwert("unbekannt")).toEqual({ typ: "text", text: "unbekannt" });
    expect(zellwert("DE06 9999 0020 2020 0004 68").typ).toBe("text");
    expect(zellwert("WE 01").typ).toBe("text");
    expect(zellwert("12.3456").typ).toBe("text");
  });

  it("verschiebt Prozente exakt um zwei Stellen", () => {
    expect(prozentAlsAnteil("4.7")).toBe("0.047");
    expect(prozentAlsAnteil("100")).toBe("1");
    expect(prozentAlsAnteil("0.95")).toBe("0.0095");
    expect(prozentAlsAnteil("-12.5")).toBe("-0.125");
    expect(prozentAlsAnteil("0")).toBe("0");
  });

  it("baut gültige Blatt- und Dateinamen", () => {
    const v = new Set<string>();
    expect(blattName("Kredite [alle]: Übersicht/2026", v)).toBe("Kredite alle Übersicht 2026");
    expect(blattName("Kredite alle Übersicht 2026", v)).toBe("Kredite alle Übersicht 2026 2");
    expect(blattName("x".repeat(40), v)).toHaveLength(31);
    expect(dateiName("Häuser & Einheiten", "2026-11-27", "xlsx")).toBe("Haeuser-Einheiten_2026-11-27.xlsx");
  });
});
