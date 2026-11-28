import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dekodiere } from "../src/lib/import/csv";
import { einheitSchluessel, findeHaus, gruppiere, leseLeerstandsliste, leseStichtag, planeLeerstandImport, type HausKandidat } from "../src/lib/import/leerstandsliste";

const datei = (n: string) => dekodiere(readFileSync(`testdaten/leerstandslisten/${n}`));
const haeuser: HausKandidat[] = [
  { id: "a", bezeichnung: "Alsterblick 27", strasse: "Alsterblick 27", einheiten: [{ id: "a7", bezeichnung: "SP 07" }, { id: "a13", bezeichnung: "SP 13" }] },
  { id: "b", bezeichnung: "Am Auenwald 3", strasse: "Am Auenwald 3", einheiten: ["01", "09", "17", "29"].map((n) => ({ id: `b${n}`, bezeichnung: `WE ${n}` })) },
  { id: "c", bezeichnung: "Am Kastanienhof 3", strasse: "Am Kastanienhof 3", einheiten: ["03", "15", "27"].map((n) => ({ id: `c${n}`, bezeichnung: `WE ${n}` })) },
  { id: "d", bezeichnung: "Hafenkante 9", strasse: "Hafenkante 9", einheiten: ["04", "12"].map((n) => ({ id: `d${n}`, bezeichnung: `WE ${n}` })) },
];

describe("Alte Leerstandslisten", () => {
  it("liest Stichtage als Datum oder Monat", () => {
    expect(leseStichtag("31.12.2025")).toBe("2025-12-31");
    expect(leseStichtag("03/2026")).toBe("2026-03-31");
    expect(leseStichtag("2026-02")).toBe("2026-02-28");
    expect(leseStichtag("Stand: 28.02.2026")).toBe("2026-02-28");
    expect(leseStichtag("März 2026")).toBe("2026-03-31");
    expect(leseStichtag("Hafenkante 9")).toBeNull();
  });

  it("vereinheitlicht Einheiten und Häuser", () => {
    expect(einheitSchluessel("Whg. 03")).toBe(einheitSchluessel("WE 3"));
    expect(einheitSchluessel("Stpl. 7")).toBe(einheitSchluessel("SP 07"));
    expect(findeHaus("Alsterblick 27, 20099 Hamburg", haeuser)).toBe("a");
    expect(findeHaus("Lindenstraße 99, Bremen", haeuser)).toBeNull();
  });

  it("ordnet eine Liste mit Spalten Objekt und Stichtag zu", () => {
    const liste = leseLeerstandsliste(datei("Leerstandsliste_Hanse_HV_2025-2026.csv"));
    expect(liste.fehler).toBeNull();
    const plan = planeLeerstandImport(liste, haeuser);
    expect(plan.filter((z) => z.status === "hausUnbekannt").map((z) => z.hausText)).toEqual(["Lindenstraße 99, Bremen"]);
    expect(plan.filter((z) => z.status === "einheitUnbekannt").map((z) => z.einheit)).toEqual(["Whg. 77"]);
    const g = gruppiere(plan);
    expect(g.map((x) => `${x.hausId} ${x.stichtag} ${x.zeilen.length}`)).toEqual([
      "a 2025-12-31 2", "a 2026-03-31 1", "a 2026-04-30 1",
      "b 2025-12-31 3", "b 2026-03-31 4", "b 2026-04-30 3",
      "c 2025-12-31 2", "c 2026-03-31 2", "c 2026-04-30 1",
    ]);
    expect(g[3].zeilen[0].erwarteteMiete?.toString()).toBe("790");
  });

  it("liest Abschnitte mit Zwischenzeilen für Haus und Stichtag", () => {
    const liste = leseLeerstandsliste(datei("Leerstandsmeldung_Elbufer_Abschnitte.csv"));
    const z = liste.zeilen.map((x) => `${x.hausText} ${x.stichtag} ${x.einheit}`);
    expect(z).toEqual([
      "Hafenkante 9 2026-01-31 WE 04", "Hafenkante 9 2026-01-31 WE 12", "Nymphenhof 8 2026-01-31 WE 26", "Nymphenhof 8 2026-01-31 SP 04",
      "Hafenkante 9 2026-02-28 WE 12", "Nymphenhof 8 2026-02-28 WE 26", "Nymphenhof 8 2026-02-28 WE 36",
    ]);
  });

  it("übernimmt bestätigte Zuordnungen und KI-Vorschläge nur für passende Einheiten", () => {
    const liste = leseLeerstandsliste(datei("Leerstandsliste_Hanse_HV_2025-2026.csv"));
    const plan = planeLeerstandImport(liste, haeuser, { haeuser: { "Lindenstraße 99, Bremen": "d" }, einheiten: { "d|Whg. 2": "d12", "b|Whg. 77": "fremd" }, ki: ["Lindenstraße 99, Bremen"] });
    expect(plan.find((z) => z.einheit === "Whg. 2")?.status).toBe("ki");
    expect(plan.find((z) => z.einheit === "Whg. 2")?.einheitId).toBe("d12");
    // Vorschlag für eine Einheit eines anderen Hauses wird verworfen
    expect(plan.find((z) => z.einheit === "Whg. 77")?.status).toBe("einheitUnbekannt");
    // doppelte Einheit am selben Stichtag wird nicht doppelt gezählt
    const doppelt = planeLeerstandImport(liste, haeuser, { haeuser: {}, einheiten: { "b|Whg. 77": "b29" } });
    expect(doppelt.find((z) => z.einheit === "Whg. 77")?.status).toBe("doppelt");
  });
});
