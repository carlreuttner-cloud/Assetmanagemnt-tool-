import { describe, expect, it } from "vitest";
import { dezimal } from "../src/lib/geld";
import { abweichung, leerePlanwerte, planIst, zeilenwerte, type PlanWerte } from "../src/lib/plan-ist";

const werte = (o: Partial<Record<keyof PlanWerte, number>>): PlanWerte => {
  const w = leerePlanwerte();
  for (const [k, v] of Object.entries(o)) w[k as keyof PlanWerte] = dezimal(v);
  return w;
};

describe("Plan/Ist", () => {
  it("rechnet Zwischensummen wie die GuV und lässt sie bei Lücken unbekannt", () => {
    const z = zeilenwerte(werte({ umsatzerloese: 1000, sonstigeErtraege: 0, materialaufwand: 200, personalaufwand: 0, sonstigeAufwendungen: 100, abschreibungen: 50, zinsertraege: 0, zinsaufwendungen: 300 }));
    expect(z.ebitda?.toString()).toBe("700");
    expect(z.ebit?.toString()).toBe("650");
    expect(z.ebt?.toString()).toBe("350");
    expect(zeilenwerte(werte({ umsatzerloese: 1000 })).ebitda).toBeNull();
  });

  it("bewertet Erträge und Aufwände richtig", () => {
    expect(abweichung("umsatzerloese", dezimal(100_000), dezimal(90_000), null).wirkung).toBe("unguenstig");
    expect(abweichung("materialaufwand", dezimal(100_000), dezimal(90_000), null).wirkung).toBe("guenstig");
    expect(abweichung("zinsaufwendungen", dezimal(100_000), dezimal(120_000), null).wirkung).toBe("unguenstig");
    expect(abweichung("umsatzerloese", dezimal(5), dezimal(5), null).wirkung).toBe("keine");
  });

  it("wesentlich erst ab 5 % und 10.000 €; Erklärung fehlt wird markiert", () => {
    const klein = abweichung("umsatzerloese", dezimal(1_000_000), dezimal(1_040_000), null);
    expect(klein.prozent?.toString()).toBe("4");
    expect(klein.wesentlich).toBe(false);
    const gross = abweichung("materialaufwand", dezimal(100_000), dezimal(130_000), null);
    expect(gross.wesentlich).toBe(true);
    expect(gross.erklaerungFehlt).toBe(true);
    expect(abweichung("materialaufwand", dezimal(100_000), dezimal(130_000), " Dachreparatur ").erklaerung).toBe("Dachreparatur");
    expect(abweichung("steuern", dezimal(0), dezimal(20_000), null)).toMatchObject({ prozent: null, wesentlich: true });
    expect(abweichung("steuern", dezimal(1000), dezimal(1500), null).wesentlich).toBe(false);
  });

  it("ohne Ist bleibt alles unbekannt", () => {
    const e = planIst(werte({ umsatzerloese: 100 }), null, {});
    expect(e.mitIst).toBe(false);
    expect(e.zeilen.every((z) => z.betrag === null && z.wirkung === null && !z.wesentlich)).toBe(true);
    expect(e.unbekannt).toBe(13);
  });

  it("zählt wesentliche und unerklärte Abweichungen", () => {
    const e = planIst(werte({ umsatzerloese: 1_000_000, zinsaufwendungen: 200_000 }), werte({ umsatzerloese: 900_000, zinsaufwendungen: 260_000 }), { umsatzerloese: "Leerstand Haus 3" });
    expect(e.wesentlich).toBe(2);
    expect(e.ohneErklaerung).toBe(1);
    expect(abweichung("ebitda", dezimal(100_000), dezimal(50_000), null)).toMatchObject({ wesentlich: true, erklaerungFehlt: false });
    expect(abweichung("jahresergebnis", dezimal(100_000), dezimal(50_000), null).erklaerungFehlt).toBe(false);
  });
});
