import { describe, expect, it } from "vitest";
import { jahresNettokaltmiete } from "@/lib/miete";

describe("miete", () => {
  it("rechnet die Jahresnettokaltmiete aus der Monatsmiete", () => {
    expect(jahresNettokaltmiete("812.00").toFixed(2)).toBe("9744.00");
    expect(jahresNettokaltmiete("690.15").toFixed(2)).toBe("8281.80");
  });
});
