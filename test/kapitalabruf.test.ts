import { describe, expect, it } from "vitest";
import { abrufStand, aufteilen, positionStand } from "@/lib/kapitalabruf";
import { dezimal } from "@/lib/geld";

const d = dezimal;

describe("Kapitalabrufe", () => {
  it("verteilt anteilig auf Cent, Rest an den größten Anteil", () => {
    const a = aufteilen(d(100000), [
      { id: "a", name: "A", beteiligungProzent: d("33.333333") },
      { id: "b", name: "B", beteiligungProzent: d("33.333333") },
      { id: "c", name: "C", beteiligungProzent: d("33.333334") },
    ]);
    if (!a.ok) throw new Error(a.fehler);
    expect(a.positionen.map((p) => p.betrag.toFixed(2))).toEqual(["33333.33", "33333.33", "33333.34"]);
    expect(a.positionen.reduce((s, p) => s.plus(p.betrag), d(0)).toFixed(2)).toBe("100000.00");
  });

  it("verteilt nichts ohne vollständige Beteiligungen", () => {
    expect(aufteilen(d(1000), [{ id: "a", name: "A", beteiligungProzent: d(60) }, { id: "b", name: "B", beteiligungProzent: null }])).toEqual({ ok: false, fehler: "beteiligungFehlt", namen: ["B"] });
    const s = aufteilen(d(1000), [{ id: "a", name: "A", beteiligungProzent: d(60) }, { id: "b", name: "B", beteiligungProzent: d(30) }]);
    expect(s.ok === false && s.fehler === "summe" && s.summe?.toString()).toBe("90");
    expect(aufteilen(d(1000), [])).toEqual({ ok: false, fehler: "keineGesellschafter" });
  });

  it("verfolgt den Eingang je Position und gesamt", () => {
    const offen = positionStand(d(6000), [], "2026-11-15", "2026-11-28");
    expect(offen).toMatchObject({ status: "offen", ueberfaellig: true });
    const teil = positionStand(d(4000), [{ datum: "2026-11-10", betrag: d(1500) }], "2026-12-15", "2026-11-28");
    expect(teil.offen.toString()).toBe("2500");
    expect(teil).toMatchObject({ status: "teilweise", ueberfaellig: false, letzterEingang: "2026-11-10" });
    const voll = positionStand(d(4000), [{ datum: "2026-11-10", betrag: d(1500) }, { datum: "2026-11-20", betrag: d(2500) }], "2026-11-15", "2026-11-28");
    expect(voll).toMatchObject({ status: "bezahlt", ueberfaellig: false });
    const g = abrufStand([{ betrag: d(6000), stand: offen }, { betrag: d(4000), stand: voll }]);
    expect(g.offen.toString()).toBe("6000");
    expect(g.quote?.toString()).toBe("40");
    expect(g.status).toBe("teilweise");
    expect(g.ueberfaellig).toBe(1);
  });
});
