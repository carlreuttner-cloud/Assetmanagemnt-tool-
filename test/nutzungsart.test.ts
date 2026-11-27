import { describe, expect, it } from "vitest";
import { dezimal } from "@/lib/geld";
import { hausSummen, kennzahlenAus, type HausDaten } from "@/lib/kennzahlen";
import { NUTZUNGSART_FARBE } from "@/lib/farben";
import { NUTZUNGSARTEN, nutzungsartAus } from "@/lib/nutzungsart";

const mv = (soll: number) => ({ beginn: "2020-01-01", ende: null, istMiete: dezimal(soll), sollMiete: dezimal(soll), rueckstand: dezimal(0) });
const haus: HausDaten = {
  id: "H1",
  gesellschaftId: "G1",
  kaufpreis: null,
  verkehrswerte: [],
  einheiten: [
    { id: "W1", art: "WOHNUNG", flaeche: dezimal(80), erwarteteMiete: null, mietverhaeltnisse: [mv(1000)] },
    { id: "W2", art: "WOHNUNG", flaeche: dezimal(20), erwarteteMiete: dezimal(300), mietverhaeltnisse: [] },
    { id: "G1", art: "GEWERBE", flaeche: dezimal(100), erwarteteMiete: null, mietverhaeltnisse: [mv(1500)] },
    { id: "S1", art: "STELLPLATZ", flaeche: dezimal("12.5"), erwarteteMiete: null, mietverhaeltnisse: [mv(100)] },
    { id: "S2", art: "STELLPLATZ", flaeche: dezimal("12.5"), erwarteteMiete: dezimal(90), mietverhaeltnisse: [] },
  ],
};

describe("Nutzungsarten in den Kennzahlen", () => {
  const k = kennzahlenAus(hausSummen(haus, "2026-11-27"));

  it("zählt Stellplätze in Stück, nicht zur Fläche", () => {
    expect(k.flaeche.toString()).toBe("200");
    expect(k.leerFlaeche.toString()).toBe("20");
    expect(k.nachArt.STELLPLATZ.einheiten).toBe(2);
    expect(k.nachArt.STELLPLATZ.flaeche.toString()).toBe("0");
    expect(k.einheiten).toBe(5);
    expect(k.leereEinheiten).toBe(2);
  });

  it("Leerstand je Art: Wohnen/Gewerbe nach Fläche, Stellplätze nach Stück", () => {
    expect(k.leerstandQuote!.toString()).toBe("10");
    expect(k.leerstandQuoteNachArt.WOHNUNG!.toString()).toBe("20");
    expect(k.leerstandQuoteNachArt.GEWERBE!.toString()).toBe("0");
    expect(k.leerstandQuoteNachArt.STELLPLATZ!.toString()).toBe("50");
  });

  it("Mieten umfassen alle Arten, die m²-Miete nur Wohnen und Gewerbe", () => {
    expect(k.sollMonat.toString()).toBe("2600");
    expect(k.erwartetLeerMonat.toString()).toBe("390");
    // (1000 + 1500) / 180 m² vermietet
    expect(k.sollProM2!.toDecimalPlaces(4).toString()).toBe("13.8889");
  });

  it("hat für jede Nutzungsart genau eine feste Farbe", () => {
    expect(new Set(NUTZUNGSARTEN.map((a) => NUTZUNGSART_FARBE[a])).size).toBe(3);
    expect(nutzungsartAus("GEWERBE")).toBe("GEWERBE");
    expect(nutzungsartAus("x")).toBeUndefined();
  });
});
