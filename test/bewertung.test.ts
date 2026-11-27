import { describe, expect, it } from "vitest";
import { bewerteHaus, gebaeudewert, portfolioJahre, portfolioStand, type BewertungsHaus, type GutachtenWert } from "@/lib/bewertung";
import { dezimal } from "@/lib/geld";

const g = (id: string, hausId: string, stichtag: string, wert: number, boden: number | null = null, gebaeude: number | null = null): GutachtenWert => ({
  id, hausId, stichtag, verkehrswert: dezimal(wert), bodenwert: boden === null ? null : dezimal(boden), gebaeudewert: gebaeude === null ? null : dezimal(gebaeude), gutachter: "Test",
});

describe("Bewertung", () => {
  it("Gebäudewert aus dem Gutachten, sonst abgeleitet, sonst unbekannt", () => {
    expect(gebaeudewert(g("a", "h", "2025-12-31", 1000, 300, 650))).toEqual({ wert: dezimal(650), art: "gutachten" });
    expect(gebaeudewert(g("a", "h", "2025-12-31", 1000, 300)).wert?.toString()).toBe("700");
    expect(gebaeudewert(g("a", "h", "2025-12-31", 1000, 300)).art).toBe("abgeleitet");
    expect(gebaeudewert(g("a", "h", "2025-12-31", 1000))).toEqual({ wert: null, art: null });
  });

  it("vergleicht mit dem Vorgutachten und nimmt den jüngsten Wert", () => {
    const b = bewerteHaus([g("1", "h", "2023-12-31", 1000), g("2", "h", "2025-12-31", 1100, 300)], [{ id: "m", hausId: "h", stichtag: "2026-06-30", wert: dezimal(1150), quelle: "Bank" }]);
    expect(b.letztes?.id).toBe("2");
    expect(b.veraenderung?.toString()).toBe("100");
    expect(b.veraenderungProzent?.toString()).toBe("10");
    expect(b.aktuell).toMatchObject({ art: "marktwert", stichtag: "2026-06-30" });
    // bis zu einem Stichtag
    const frueher = bewerteHaus([g("1", "h", "2023-12-31", 1000), g("2", "h", "2025-12-31", 1100)], [], "2024-12-31");
    expect(frueher.letztes?.id).toBe("1");
    expect(frueher.vorher).toBeNull();
    expect(frueher.veraenderung).toBeNull();
  });

  it("Portfolio-Summen zählen fehlende Häuser statt 0 anzunehmen", () => {
    const haeuser: BewertungsHaus[] = [
      { hausId: "a", kaufdatum: "2015-01-01", gutachten: [g("1", "a", "2024-12-31", 1000, 200)], marktwerte: [] },
      { hausId: "b", kaufdatum: "2015-01-01", gutachten: [g("2", "b", "2025-12-31", 2000, 500, 1400)], marktwerte: [] },
      { hausId: "c", kaufdatum: "2030-01-01", gutachten: [], marktwerte: [] },
    ];
    const s = portfolioStand(haeuser, "2025-12-31");
    expect(s.wert).toMatchObject({ bekannt: 2, gesamt: 2, vollstaendig: true });
    expect(s.wert.summe?.toString()).toBe("3000");
    expect(s.gebaeudewert.summe?.toString()).toBe("2200");
    expect(s.gebaeudewert.abgeleitet).toBe(1);
    expect([s.stichtageVon, s.stichtageBis]).toEqual(["2024-12-31", "2025-12-31"]);

    const jahre = portfolioJahre(haeuser, "2026-11-27");
    expect(jahre[2].stichtag).toBe("2026-11-27");
    expect(jahre.map((j) => j.jahr)).toEqual([2024, 2025, 2026]);
    expect(jahre[0].wert).toMatchObject({ bekannt: 1, gesamt: 2, vollstaendig: false });
    expect(jahre[1].veraenderung).toBeNull(); // Vorjahr unvollständig
    expect(jahre[2].veraenderung?.toString()).toBe("0");
  });
});
