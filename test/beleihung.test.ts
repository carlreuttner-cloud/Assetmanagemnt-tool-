import { describe, expect, it } from "vitest";
import { gruppenReserve, hausReserve, zielLtvAus } from "@/lib/beleihung";
import { dezimal } from "@/lib/geld";
import type { HausDaten } from "@/lib/kennzahlen";
import type { KreditDaten } from "@/lib/kredit";

const haus = (id: string, vw: string | null, stichtag = "2026-01-01"): HausDaten => ({
  id,
  gesellschaftId: "g1",
  kaufpreis: null,
  verkehrswerte: vw ? [{ stichtag, wert: dezimal(vw) }] : [],
  einheiten: [],
});
const kredit = (id: string, haeuser: Array<[string, number]>, saldo: string | null, stichtag = "2026-06-30"): KreditDaten =>
  ({
    id,
    gesellschaftId: "g1",
    auszahlungsdatum: "2020-01-01",
    haeuser: haeuser.map(([hausId, a]) => ({ hausId, anteilProzent: dezimal(a) })),
    buchungen: [],
    salden: saldo ? [{ art: "DARLEHEN", status: "BELEGT", stichtag, betrag: dezimal(saldo), quelle: "KONTOAUSZUG" }] : [],
  }) as unknown as KreditDaten;

describe("Beleihungsreserve", () => {
  it("rechnet Verkehrswert × Ziel-LTV − belegte Restschuld", () => {
    const r = hausReserve(haus("h1", "1000000"), [kredit("k1", [["h1", 100]], "400000")], dezimal(60), "2026-11-28");
    expect(r.reserve?.toString()).toBe("200000");
    expect(r.ltvIst?.toString()).toBe("40");
    expect(r.luecken).toEqual([]);
  });

  it("rechnet Kredite anteilig und zeigt Überschreitung negativ", () => {
    const k = kredit("k1", [["h1", 50], ["h2", 50]], "1400000");
    const a = hausReserve(haus("h1", "1000000"), [k], dezimal(60), "2026-11-28");
    const b = hausReserve(haus("h2", "2000000"), [k], dezimal(60), "2026-11-28");
    expect(a.reserve?.toString()).toBe("-100000");
    expect(b.reserve?.toString()).toBe("500000");
    const g = gruppenReserve([a, b], dezimal(60));
    expect(g.reserve?.toString()).toBe("400000");
    expect(g.reservePositiv?.toString()).toBe("500000");
    expect(g.stichtagVon).toBe("2026-01-01");
    expect(g.stichtagBis).toBe("2026-06-30");
  });

  it("lässt die Reserve ohne Saldo oder Verkehrswert unbekannt", () => {
    const ohneSaldo = hausReserve(haus("h1", "1000000"), [kredit("k1", [["h1", 100]], null)], dezimal(60), "2026-11-28");
    expect(ohneSaldo.reserve).toBeNull();
    expect(ohneSaldo.luecken).toEqual(["restschuld"]);
    const ohneWert = hausReserve(haus("h2", null), [], dezimal(60), "2026-11-28");
    expect(ohneWert.reserve).toBeNull();
    expect(ohneWert.luecken).toEqual(["verkehrswert"]);
    const g = gruppenReserve([ohneSaldo, ohneWert], dezimal(60));
    expect(g.reserve).toBeNull();
    expect(g.bekannt).toBe(0);
  });

  it("nimmt keinen Verkehrswert nach dem Stichtag", () => {
    const r = hausReserve(haus("h1", "1000000", "2027-01-01"), [], dezimal(60), "2026-11-28");
    expect(r.luecken).toEqual(["verkehrswert"]);
  });

  it("liest den Ziel-LTV sicher ein", () => {
    expect(zielLtvAus("70").toString()).toBe("70");
    expect(zielLtvAus("62,5").toString()).toBe("62.5");
    expect(zielLtvAus("0").toString()).toBe("60");
    expect(zielLtvAus("150").toString()).toBe("60");
    expect(zielLtvAus("abc").toString()).toBe("60");
    expect(zielLtvAus(undefined).toString()).toBe("60");
  });
});
