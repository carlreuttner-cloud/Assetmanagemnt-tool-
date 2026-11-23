import { describe, expect, it } from "vitest";
import { aufCent, dezimal, formatBetrag, formatProzent, parseBetrag, zuText } from "@/lib/geld";

describe("geld", () => {
  it("rechnet ohne Gleitkommafehler", () => {
    expect(dezimal("0.1").plus("0.2").toFixed()).toBe("0.3");
  });

  it("lehnt Gleitkommazahlen ab", () => {
    expect(() => dezimal(0.1)).toThrow();
    expect(dezimal(42).toFixed()).toBe("42");
  });

  it("liest deutsche Eingaben", () => {
    expect(parseBetrag("1.234,56").toFixed()).toBe("1234.56");
    expect(parseBetrag("1234,5").toFixed()).toBe("1234.5");
    expect(parseBetrag("1.234.567").toFixed()).toBe("1234567");
    expect(parseBetrag("-12,30 €").toFixed()).toBe("-12.3");
    expect(parseBetrag("99.95").toFixed()).toBe("99.95");
    expect(() => parseBetrag("abc")).toThrow();
  });

  it("rundet kaufmännisch auf Cent", () => {
    expect(aufCent("2.345").toFixed(2)).toBe("2.35");
    expect(aufCent("-2.345").toFixed(2)).toBe("-2.35");
  });

  it("formatiert Beträge und Prozente", () => {
    expect(formatBetrag("1234567.891")).toBe("1.234.567,89 €");
    // Mehr Stellen als eine Gleitkommazahl genau darstellen kann
    expect(formatBetrag("123456789012.34")).toBe("123.456.789.012,34 €");
    expect(formatProzent("3.125")).toBe("3,125 %");
  });

  it("serialisiert als Text", () => {
    expect(zuText(dezimal("1200.50"))).toBe("1200.5");
    expect(zuText(null)).toBeNull();
  });
});
