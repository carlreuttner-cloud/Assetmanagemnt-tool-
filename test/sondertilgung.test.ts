import { describe, expect, it } from "vitest";
import { dezimal } from "@/lib/geld";
import { laufendesJahr, rechtGiltBis, sondertilgung, zeitraeume, type SondertilgungEingabe } from "@/lib/sondertilgung";

const basis = (o: Partial<SondertilgungEingabe> = {}): SondertilgungEingabe => ({
  recht: "PROZENT",
  wert: dezimal(5),
  jahr: "KALENDERJAHR",
  uebertragbar: false,
  bis: null,
  ursprungsbetrag: dezimal(1000000),
  auszahlungsdatum: "2024-03-15",
  zinsbindungBis: "2034-03-31",
  laufzeitBis: null,
  buchungen: [],
  ...o,
});
const st = (datum: string, betrag: string) => ({ datum, art: "SONDERTILGUNG" as const, betrag: dezimal(betrag) });

describe("Sondertilgungsrechte", () => {
  it("bildet Kalender- und Vertragsjahre", () => {
    expect(zeitraeume("2024-03-15", "KALENDERJAHR", "2026-11-28")).toEqual([
      { von: "2024-03-15", bis: "2024-12-31" },
      { von: "2025-01-01", bis: "2025-12-31" },
      { von: "2026-01-01", bis: "2026-12-31" },
    ]);
    expect(zeitraeume("2024-03-15", "VERTRAGSJAHR", "2025-03-15")).toEqual([
      { von: "2024-03-15", bis: "2025-03-14" },
      { von: "2025-03-15", bis: "2026-03-14" },
    ]);
  });

  it("rechnet erlaubt, genutzt und offen je Jahr", () => {
    const e = sondertilgung(basis({ buchungen: [st("2025-06-30", "20000"), st("2025-12-15", "10000"), st("2026-02-01", "-60000"), { datum: "2026-01-31", art: "TILGUNG", betrag: dezimal(5000) }] }), "2026-11-28");
    if (e.art !== "recht") throw new Error(e.art);
    expect(e.jahresrecht.toString()).toBe("50000");
    const [j24, j25, j26] = e.jahre;
    expect(j24.genutzt.toString()).toBe("0");
    expect(j25.genutzt.toString()).toBe("30000");
    expect(j25.offen.toString()).toBe("20000");
    expect(j26.genutzt.toString()).toBe("60000");
    expect(j26.offen.toString()).toBe("0");
    expect(j26.ueberschritten.toString()).toBe("10000");
    expect(laufendesJahr(e)?.von).toBe("2026-01-01");
  });

  it("überträgt nicht genutzte Beträge nur, wenn vereinbart", () => {
    const e = sondertilgung(basis({ recht: "BETRAG", wert: dezimal(10000), uebertragbar: true, buchungen: [st("2025-05-01", "4000")] }), "2025-11-28");
    if (e.art !== "recht") throw new Error(e.art);
    expect(e.jahre.map((j) => [j.uebertrag.toString(), j.offen.toString()])).toEqual([
      ["0", "10000"],
      ["10000", "16000"],
    ]);
  });

  it("endet mit der Zinsbindung", () => {
    const e = sondertilgung(basis({ zinsbindungBis: "2025-06-30" }), "2026-11-28");
    if (e.art !== "recht") throw new Error(e.art);
    expect(e.jahre.at(-1)).toMatchObject({ von: "2025-01-01", bis: "2025-06-30", laufend: false });
    expect(laufendesJahr(e)).toBeNull();
    expect(rechtGiltBis({ bis: "2030-01-01", zinsbindungBis: "2025-06-30", laufzeitBis: null })).toBe("2030-01-01");
  });

  it("schätzt nichts, wenn das Recht fehlt", () => {
    expect(sondertilgung(basis({ recht: "UNBEKANNT", buchungen: [st("2025-01-01", "5")] }), "2026-11-28")).toMatchObject({ art: "unbekannt", grund: "recht" });
    expect(sondertilgung(basis({ wert: null }), "2026-11-28")).toMatchObject({ art: "unbekannt", grund: "wert" });
    expect(sondertilgung(basis({ recht: "KEINES" }), "2026-11-28").art).toBe("keines");
  });
});
