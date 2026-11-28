import { describe, expect, it } from "vitest";
import { dezimal } from "../src/lib/geld";
import { betragAusText, wirksamAb, erhoehungMoeglich, fuelleVorlage, prozentAusText, rechneErhoehung, unbekanntePlatzhalter } from "../src/lib/serienbrief";

describe("Serienbriefe", () => {
  it("füllt Platzhalter und markiert fehlende Werte", () => {
    const g = fuelleVorlage("Sehr geehrte/r {{mieter}}, Ihre Wohnung {{ einheit }} hat {{flaeche}} m². {{foo}}", { mieter: "Frau Muster", einheit: "WE 3", flaeche: null });
    expect(g.text).toBe("Sehr geehrte/r Frau Muster, Ihre Wohnung WE 3 hat [fehlt: flaeche] m². {{foo}}");
    expect(g.fehlend).toEqual(["flaeche"]);
    expect(unbekanntePlatzhalter("{{mieter}} {{foo}} {{foo}} {{Bar}}")).toEqual(["foo", "Bar"]);
  });

  it("rechnet die neue Miete auf Cent und prüft die Kappungsgrenze", () => {
    const e = rechneErhoehung(dezimal("812.37"), { prozent: dezimal(10) });
    expect(e.neueMiete.toString()).toBe("893.61");
    expect(e.betrag.toString()).toBe("81.24");
    expect(e.ueberKappung).toBe(false);
    expect(rechneErhoehung(dezimal(500), { prozent: dezimal("20.5") }).ueberKappung).toBe(true);
    const b = rechneErhoehung(dezimal(800), { betrag: dezimal(50) });
    expect(b.neueMiete.toString()).toBe("850");
    expect(b.prozent?.toString()).toBe("6.25");
    expect(rechneErhoehung(dezimal(200), { betrag: dezimal(50) }).ueberKappung).toBe(true);
    expect(rechneErhoehung(dezimal(0), { betrag: dezimal(50) }).prozent).toBeNull();
  });

  it("prüft, ob eine Erhöhung jetzt verlangt werden kann", () => {
    expect(erhoehungMoeglich({ einheitArt: "WOHNUNG", beginn: "2024-01-01", letzteMieterhoehung: null }, "2026-11-28").moeglich).toBe(true);
    expect(erhoehungMoeglich({ einheitArt: "WOHNUNG", beginn: "2024-01-01", letzteMieterhoehung: "2026-03-01" }, "2026-11-28").grund).toBe("nochNicht");
    expect(erhoehungMoeglich({ einheitArt: "GEWERBE", beginn: "2020-01-01", letzteMieterhoehung: null }, "2026-11-28").grund).toBe("keinWohnraum");
  });

  it("setzt das Wirksamwerden frühestens auf den dritten Monat nach Zugang", () => {
    expect(wirksamAb("2025-04-01", "2026-11-28")).toBe("2027-02-01");
    expect(wirksamAb("2027-06-01", "2026-11-28")).toBe("2027-06-01");
  });

  it("liest Prozentwerte", () => {
    expect(prozentAusText("7,5")?.toString()).toBe("7.5");
    expect(prozentAusText("0")).toBeNull();
    expect(prozentAusText("abc")).toBeNull();
    expect(prozentAusText("")).toBeNull();
    expect(betragAusText("1.234,50")?.toString()).toBe("1234.5");
    expect(betragAusText("0")).toBeNull();
    expect(betragAusText("x")).toBeNull();
  });
});
