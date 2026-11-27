import { describe, expect, it } from "vitest";
import { dezimal } from "@/lib/geld";
import { summiereMassnahmen, werteMassnahmeAus, type MassnahmeDaten } from "@/lib/massnahme";

const m = (x: Partial<MassnahmeDaten>): MassnahmeDaten => ({ status: "ABGESCHLOSSEN", budget: null, mehrmieteMonat: null, kosten: [], ...x });

describe("Maßnahmen", () => {
  it("Abweichung, Jahresmehrmiete und Rendite auf Ist-Kosten", () => {
    const a = werteMassnahmeAus(m({ budget: dezimal(100000), mehrmieteMonat: dezimal(500), kosten: [dezimal(60000), dezimal(60000)] }));
    expect(a.ist?.toString()).toBe("120000");
    expect(a.abweichung?.toString()).toBe("20000");
    expect(a.abweichungProzent?.toString()).toBe("20");
    expect(a.mehrmieteJahr?.toString()).toBe("6000");
    expect(a.basis).toBe("ist");
    expect(a.rendite?.toString()).toBe("5");
    expect(a.amortisationJahre?.toString()).toBe("20");
  });

  it("geplante Maßnahme rechnet auf das Budget, ohne Budget unbekannt", () => {
    const plan = werteMassnahmeAus(m({ status: "GEPLANT", budget: dezimal(50000), mehrmieteMonat: dezimal(250) }));
    expect(plan.basis).toBe("budget");
    expect(plan.ist).toBeNull();
    expect(plan.abweichung).toBeNull();
    expect(plan.rendite?.toString()).toBe("6");
    const ohne = werteMassnahmeAus(m({ status: "GEPLANT", mehrmieteMonat: dezimal(250) }));
    expect(ohne.rendite).toBeNull();
  });

  it("Mehrmiete unbekannt bleibt unbekannt, 0 ist 0", () => {
    expect(werteMassnahmeAus(m({ kosten: [dezimal(1000)] })).rendite).toBeNull();
    const null0 = werteMassnahmeAus(m({ kosten: [dezimal(1000)], mehrmieteMonat: dezimal(0) }));
    expect(null0.rendite?.toString()).toBe("0");
    expect(null0.amortisationJahre).toBeNull();
  });

  it("Summen zählen Unbekanntes", () => {
    const liste = [m({ budget: dezimal(100), kosten: [dezimal(110)], mehrmieteMonat: dezimal(1) }), m({ kosten: [dezimal(50)] })].map((x) => ({ m: x, a: werteMassnahmeAus(x) }));
    const s = summiereMassnahmen(liste);
    expect(s.budget.toString()).toBe("100");
    expect(s.budgetUnbekannt).toBe(1);
    expect(s.ist.toString()).toBe("160");
    expect(s.abweichung?.toString()).toBe("10");
    expect(s.vergleichbar).toBe(1);
    expect(s.mehrmieteJahr.toString()).toBe("12");
    expect(s.mehrmieteUnbekannt).toBe(1);
  });
});
