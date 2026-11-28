import { describe, expect, it } from "vitest";
import { dezimal } from "@/lib/geld";
import type { Bewegung } from "@/lib/kapitalkonto";
import { rendite, xirr } from "@/lib/rendite";

const b = (art: Bewegung["art"], datum: string | null, betrag: string): Bewegung => ({ art, datum, betrag: dezimal(betrag) });

describe("Investorenrenditen", () => {
  it("XIRR: 1.000 → 1.100 nach einem Jahr = 10 %", () => {
    const r = xirr([{ datum: "2025-01-01", betrag: dezimal(-1000) }, { datum: "2026-01-01", betrag: dezimal(1100) }]);
    expect(r.irr?.toFixed(4)).toBe("10.0000");
  });

  it("XIRR mit mehreren Zahlungen", () => {
    // −1000, +100 nach 1 Jahr, +1100 nach 2 Jahren → 10 %
    const r = xirr([
      { datum: "2023-01-01", betrag: dezimal(-1000) },
      { datum: "2024-01-01", betrag: dezimal(100) },
      { datum: "2024-12-31", betrag: dezimal(1100) },
    ]);
    expect(Number(r.irr)).toBeCloseTo(10, 1);
  });

  it("nennt den Grund, wenn kein IRR bestimmbar ist", () => {
    expect(xirr([]).grund).toBe("keineZahlungen");
    expect(xirr([{ datum: "2025-01-01", betrag: dezimal(-5) }]).grund).toBe("keinRueckfluss");
    expect(xirr([{ datum: "2025-01-01", betrag: dezimal(5) }]).grund).toBe("keineEinlage");
  });

  it("rechnet Multiple und Cash-on-Cash nur aus datierten Zahlungen", () => {
    const r = rendite(
      [
        b("EINLAGE", "2022-03-01", "1000000"),
        b("EINLAGE", "2024-06-30", "200000"),
        b("AUSSCHUETTUNG", "2024-12-15", "60000"),
        b("AUSSCHUETTUNG", "2025-12-15", "72000"),
        b("RUECKZAHLUNG", "2026-03-31", "100000"),
        b("AUSSCHUETTUNG", null, "50000"),
      ],
      "2026-11-28",
      3,
    );
    expect(r.einlagen.toString()).toBe("1200000");
    expect(r.rueckfluesse.toString()).toBe("232000");
    expect(r.multiple?.toFixed(4)).toBe("0.1933");
    expect(r.ohneDatum).toBe(1);
    expect(r.irr?.isNegative()).toBe(true);
    expect(r.cashOnCash.map((c) => [c.jahr, c.ausschuettungen.toString(), c.kapital.toString(), c.quote?.toFixed(1)])).toEqual([
      [2026, "0", "1100000", "0.0"],
      [2025, "72000", "1200000", "6.0"],
      [2024, "60000", "1200000", "5.0"],
    ]);
  });
});
