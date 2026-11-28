import { describe, expect, it } from "vitest";
import { bauteilStatus, faelligBis, istUebernommen, kostenJeJahr, naechsteErneuerung, planjahr } from "../src/lib/instandhaltung";
import { dezimal } from "../src/lib/geld";

const b = (letzte: number | null, zyklus: number | null, kosten: number | null = null) => ({ letzteErneuerung: letzte, zyklusJahre: zyklus, geplanteKosten: kosten === null ? null : dezimal(kosten) });

describe("Instandhaltung", () => {
  it("bestimmt die nächste Erneuerung und lässt Lücken unbekannt", () => {
    expect(naechsteErneuerung(b(2000, 30))).toBe(2030);
    expect(naechsteErneuerung(b(null, 30))).toBeNull();
    expect(naechsteErneuerung(b(2000, null))).toBeNull();
    expect(naechsteErneuerung(b(2000, 0))).toBeNull();
  });

  it("ordnet den Status zum Jahr zu", () => {
    expect(bauteilStatus(b(1990, 30), 2026)).toBe("ueberfaellig");
    expect(bauteilStatus(b(1996, 30), 2026)).toBe("faellig");
    expect(bauteilStatus(b(2001, 30), 2026)).toBe("bald");
    expect(bauteilStatus(b(2002, 30), 2026)).toBe("spaeter");
    expect(bauteilStatus(b(null, 30), 2026)).toBe("unbekannt");
    expect(planjahr(b(1990, 30), 2026)).toBe(2026);
  });

  it("summiert Kosten je Jahr und zählt fehlende Kosten", () => {
    const k = kostenJeJahr([b(1990, 30, 100_000), b(1996, 30), b(2000, 30, 50_000), b(2020, 30, 1)], 2026, 5);
    expect(k.map((x) => x.jahr)).toEqual([2026, 2027, 2028, 2029, 2030]);
    expect(k[0]).toMatchObject({ anzahl: 2, ohneKosten: 1 });
    expect(k[0].summe.toString()).toBe("100000");
    expect(k[4].summe.toString()).toBe("50000");
    const f = faelligBis([b(1990, 30, 100_000), b(1996, 30), b(2000, 30, 50_000)], 2026, 2027);
    expect(f).toMatchObject({ anzahl: 2, ohneKosten: 1 });
  });

  it("erkennt übernommene Planpositionen nur für die nächste Erneuerung", () => {
    expect(istUebernommen({ letzteErneuerung: 1996 }, [{ monat: "2026-06-01" }])).toBe(true);
    expect(istUebernommen({ letzteErneuerung: 2026 }, [{ monat: "2026-06-01" }])).toBe(false);
    expect(istUebernommen({ letzteErneuerung: 1996 }, [])).toBe(false);
  });
});
