import { describe, expect, it } from "vitest";
import { darf } from "@/lib/auth/rechte";
import { fundFeld, ibanLesbar, suchbegriff } from "@/lib/suche";

describe("Globale Suche", () => {
  it("verlangt mindestens 2 Zeichen und entfernt Leerzeichen für IBANs", () => {
    expect(suchbegriff(" a ")).toBeNull();
    expect(suchbegriff(undefined)).toBeNull();
    expect(suchbegriff("  DE06 9999  0020 ")).toEqual({ text: "DE06 9999 0020", kompakt: "DE0699990020" });
  });

  it("meldet das Feld des Treffers, nicht aber den Titel", () => {
    const s = suchbegriff("de06 9999")!;
    expect(fundFeld("Darlehen Ankauf", [["IBAN", "DE06999900202020000468"]], s)).toEqual({ feld: "IBAN", fundstelle: "DE06999900202020000468" });
    expect(fundFeld("Lindenhof", [["Ort", "Berlin"]], suchbegriff("linden")!)).toEqual({ feld: null, fundstelle: null });
    expect(fundFeld("X", [["Ort", null], ["Straße", "Müllerstraße 3"]], suchbegriff("MÜLLER")!).feld).toBe("Straße");
  });

  it("zeigt IBANs in Vierergruppen", () => {
    expect(ibanLesbar("DE06999900202020000468")).toBe("DE06 9999 0020 2020 0004 68");
  });

  it("ist für Hausverwaltung gesperrt, für Investoren nur lesend", () => {
    expect(darf("HAUSVERWALTUNG", "suche")).toBe(false);
    expect(darf("INVESTOR", "suche")).toBe(true);
    expect(darf("INVESTOR", "suche", "schreiben")).toBe(false);
    expect(darf("MITARBEITER", "suche")).toBe(true);
  });
});
