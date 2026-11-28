import { describe, expect, it } from "vitest";
import { dezimal } from "@/lib/geld";
import { belastungHaus, istAktiv, sicherungsverbuende, type SicherheitDaten } from "@/lib/sicherheit";

const gs = (id: string, betrag: string | null, kreditIds: string[], hausIds: string[], extra: Partial<SicherheitDaten> = {}): SicherheitDaten => ({
  id,
  art: "GRUNDSCHULD",
  betrag: betrag === null ? null : dezimal(betrag),
  eingetragenAm: null,
  gueltigBis: null,
  geloeschtAm: null,
  hausIds,
  kreditIds,
  ...extra,
});
const rs = (betrag: string, stichtag = "2025-12-31") => ({ betrag: dezimal(betrag), stichtag, herkunft: "saldo" as const, quelle: "BANKBESTAETIGUNG" as const, quelleText: null });

describe("Sicherheiten", () => {
  it("prüft, ob eine Sicherheit am Stichtag aktiv ist", () => {
    expect(istAktiv({ eingetragenAm: "2020-01-01", gueltigBis: null, geloeschtAm: null }, "2026-01-01")).toBe(true);
    expect(istAktiv({ eingetragenAm: "2027-01-01", gueltigBis: null, geloeschtAm: null }, "2026-01-01")).toBe(false);
    expect(istAktiv({ eingetragenAm: null, gueltigBis: null, geloeschtAm: "2025-06-30" }, "2026-01-01")).toBe(false);
    expect(istAktiv({ eingetragenAm: null, gueltigBis: "2025-12-31", geloeschtAm: null }, "2026-01-01")).toBe(false);
  });

  it("bildet Verbünde über gemeinsame Grundschulden und rechnet die freie Grundschuld", () => {
    const v = sicherungsverbuende(
      [gs("s1", "1000000", ["k1"], ["h1"]), gs("s2", "3000000", ["k2", "k3"], ["h2", "h3"]), gs("s3", "500000", ["k3"], ["h3"])],
      [
        { id: "k1", restschuld: rs("800000") },
        { id: "k2", restschuld: rs("1500000", "2025-12-31") },
        { id: "k3", restschuld: rs("1000000", "2026-06-30") },
      ],
      "2026-11-28",
    );
    expect(v).toHaveLength(2);
    const k1 = v.find((x) => x.kreditIds.includes("k1"))!;
    expect(k1.freieGrundschuld?.toFixed(0)).toBe("200000");
    const k23 = v.find((x) => x.kreditIds.includes("k2"))!;
    expect(k23.kreditIds.sort()).toEqual(["k2", "k3"]);
    expect(k23.grundpfandrechte?.toFixed(0)).toBe("3500000");
    expect(k23.freieGrundschuld?.toFixed(0)).toBe("1000000");
    expect(k23.stichtage).toEqual({ von: "2025-12-31", bis: "2026-06-30" });
  });

  it("lässt die freie Grundschuld unbekannt, wenn Restschuld oder Betrag fehlt", () => {
    const [a] = sicherungsverbuende([gs("s1", "1000000", ["k1"], ["h1"])], [{ id: "k1", restschuld: null }], "2026-11-28");
    expect(a.freieGrundschuld).toBeNull();
    expect(a.luecken).toContain("restschuld");
    const [b] = sicherungsverbuende([gs("s1", null, ["k1"], ["h1"])], [{ id: "k1", restschuld: rs("1") }], "2026-11-28");
    expect(b.freieGrundschuld).toBeNull();
    expect(b.luecken).toContain("betrag");
    const [c] = sicherungsverbuende([], [{ id: "k1", restschuld: rs("1") }], "2026-11-28");
    expect(c.luecken).toContain("keinGrundpfandrecht");
  });

  it("zählt gelöschte und Bürgschaften nicht als Grundpfandrecht", () => {
    const v = sicherungsverbuende(
      [gs("s1", "1000000", ["k1"], ["h1"], { geloeschtAm: "2026-01-01" }), gs("s2", "200000", ["k1"], [], { art: "BUERGSCHAFT" })],
      [{ id: "k1", restschuld: rs("1") }],
      "2026-11-28",
    );
    expect(v[0].luecken).toContain("keinGrundpfandrecht");
    expect(belastungHaus([gs("s1", "1000000", [], ["h1", "h2"]), gs("s2", "250000", [], ["h1"])], "h1", "2026-11-28")).toMatchObject({ anzahl: 2, gesamtrechte: 1 });
  });
});
