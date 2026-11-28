import { describe, expect, it } from "vitest";
import { ausweisStatus, istEnergieklasse, jahresSumme, klassenVerteilung, massgeblicherAusweis, verlauf, type VerbrauchDaten } from "../src/lib/energie";
import { dezimal } from "../src/lib/geld";

const v = (jahr: number, menge: number, medium: VerbrauchDaten["medium"] = "WAERME", co2?: number): VerbrauchDaten => ({
  jahr,
  medium,
  menge: dezimal(menge),
  kosten: null,
  co2Kg: co2 === undefined ? null : dezimal(co2),
  quelle: "Heizkostenabrechnung",
});

describe("Energie", () => {
  it("wählt den maßgeblichen Ausweis und bestimmt den Status", () => {
    const a = massgeblicherAusweis([
      { gueltigBis: "2024-05-01", ausgestelltAm: "2014-05-01" },
      { gueltigBis: "2034-07-01", ausgestelltAm: "2024-07-01" },
      { gueltigBis: null, ausgestelltAm: "2025-01-01" },
    ]);
    expect(a?.gueltigBis).toBe("2034-07-01");
    expect(massgeblicherAusweis([])).toBeNull();
    expect(ausweisStatus(null, "2026-11-28")).toBe("fehlt");
    expect(ausweisStatus({ gueltigBis: null }, "2026-11-28")).toBe("gueltigUnbekannt");
    expect(ausweisStatus({ gueltigBis: "2026-11-27" }, "2026-11-28")).toBe("abgelaufen");
    expect(ausweisStatus({ gueltigBis: "2027-11-28" }, "2026-11-28")).toBe("laeuftAb");
    expect(ausweisStatus({ gueltigBis: "2027-11-29" }, "2026-11-28")).toBe("gueltig");
  });

  it("prüft Energieklassen", () => {
    expect(istEnergieklasse("A+")).toBe(true);
    expect(istEnergieklasse("I")).toBe(false);
  });

  it("rechnet Verbrauch je m² und Veränderung zum Vorjahr", () => {
    const r = verlauf([v(2025, 90_000), v(2024, 100_000), v(2025, 5_000, "STROM")], "WAERME", { summe: dezimal(1000), fehlend: 1 });
    expect(r.map((x) => x.jahr)).toEqual([2024, 2025]);
    expect(r[1].jeQm?.toString()).toBe("90");
    expect(r[1].vorjahr?.toString()).toBe("-10");
    expect(r[0].vorjahr).toBeNull();
    expect(r[1].flaecheUnvollstaendig).toBe(true);
    expect(verlauf([v(2025, 1)], "WAERME", { summe: dezimal(0), fehlend: 3 })[0].jeQm).toBeNull();
  });

  it("verteilt Klassen und lässt Unbekanntes unbekannt", () => {
    const k = klassenVerteilung(["C", "C", null, "X", "A+"]);
    expect(k.find((x) => x.klasse === "C")?.anzahl).toBe(2);
    expect(k.find((x) => x.klasse === "A+")?.anzahl).toBe(1);
    expect(k.find((x) => x.klasse === "unbekannt")?.anzahl).toBe(2);
  });

  it("summiert CO₂ nur aus bekannten Werten und zählt Lücken", () => {
    const s = jahresSumme([{ verbraeuche: [v(2025, 1, "WAERME", 1200)] }, { verbraeuche: [v(2025, 1)] }, { verbraeuche: [] }], 2025, "WAERME", "co2Kg");
    expect(s).toMatchObject({ bekannt: 1, fehlend: 2 });
    expect(s.summe.toString()).toBe("1200");
  });
});
