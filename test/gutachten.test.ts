import { describe, expect, it } from "vitest";
import { dezimal } from "@/lib/geld";
import { barwertfaktor, gutachtenVerlauf, pruefwerte, swotPunkte, type GutachtenDaten } from "@/lib/gutachten";

const leer: GutachtenDaten = {
  id: "a", stichtag: "2025-12-31", verkehrswert: dezimal(2_000_000), rohertragJahr: null, bewirtschaftungskosten: null, reinertragJahr: null,
  liegenschaftszins: null, restnutzungsdauer: null, barwertfaktor: null, bodenwert: null, ertragswert: null, wohnflaeche: null, gewerbeflaeche: null,
};

describe("Gutachten", () => {
  it("Barwertfaktor: 3 % über 40 Jahre ≈ 23,1148", () => {
    expect(barwertfaktor(dezimal(3), 40)!.toFixed(4)).toBe("23.1148");
  });

  it("ohne Angaben keine Prüfwerte (nichts geschätzt)", () => {
    const p = pruefwerte(leer, null);
    expect(Object.values(p).every((w) => w === null)).toBe(true);
  });

  it("Ertragswert-Kontrolle aus Reinertrag, Bodenwert, Liegenschaftszins und Restnutzungsdauer", () => {
    const g = { ...leer, rohertragJahr: dezimal(120_000), bewirtschaftungskosten: dezimal(24_000), liegenschaftszins: dezimal(3), restnutzungsdauer: 40, bodenwert: dezimal(500_000), wohnflaeche: dezimal(1_600) };
    const p = pruefwerte(g, null);
    expect(p.reinertrag!.toFixed(0)).toBe("96000");
    expect(p.bewirtschaftungskostenProzent!.toFixed(1)).toBe("20.0");
    expect(p.rohertragsfaktor!.toFixed(2)).toBe("16.67");
    expect(p.wertProM2!.toFixed(2)).toBe("1250.00");
    // (96.000 − 15.000) × 23,1148 + 500.000
    expect(p.ertragswert!.toFixed(0)).toBe("2372297");
  });

  it("Verlauf: neuestes zuerst, Veränderung zum vorherigen", () => {
    const v = gutachtenVerlauf([leer, { ...leer, id: "b", stichtag: "2023-12-31", verkehrswert: dezimal(1_800_000) }]);
    expect(v.map((x) => x.g.id)).toEqual(["a", "b"]);
    expect(v[0].p.veraenderung!.toFixed(0)).toBe("200000");
    expect(v[0].p.veraenderungProzent!.toFixed(2)).toBe("11.11");
    expect(v[1].p.veraenderung).toBeNull();
  });

  it("SWOT: ein Punkt je Zeile, Aufzählungszeichen entfernt", () => {
    expect(swotPunkte("- gute Lage\n\n• Aufzug\n")).toEqual(["gute Lage", "Aufzug"]);
  });
});
