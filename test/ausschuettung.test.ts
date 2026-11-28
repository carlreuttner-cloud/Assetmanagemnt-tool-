import { describe, expect, it } from "vitest";
import { pruefeAusschuettung, spielraum, verteilung } from "@/lib/ausschuettung";
import { dezimal } from "@/lib/geld";
import type { Liquiditaetsplan } from "@/lib/liquiditaet";

const plan = (bestaende: Array<number | null>, mindest: number | null = null): Liquiditaetsplan =>
  ({
    beginn: "2026-12-01",
    ende: "2027-03-31",
    mindestliquiditaet: mindest === null ? null : dezimal(mindest),
    monate: bestaende.map((b, i) => ({ monat: ["2026-12-01", "2027-01-01", "2027-02-01", "2027-03-01"][i], bestand: b === null ? null : dezimal(b) })),
  }) as unknown as Liquiditaetsplan;

describe("Ausschüttungsplanung", () => {
  it("rechnet den Spielraum bis zur Mindestliquidität über die Folgemonate", () => {
    const s = spielraum(plan([100000, 80000, 120000, 90000], 50000), "2027-01-15");
    expect(s?.betrag.toString()).toBe("30000");
    expect(s?.tiefster.monat).toBe("2027-01-01");
  });

  it("gibt frei, wenn Liquidität, Sperren und Covenants passen", () => {
    const p = pruefeAusschuettung(plan([100000, 80000, 120000, 90000], 50000), "2027-01-01", dezimal(20000), [{ kreditId: "k", kennzahl: "DSCR", status: "frei" }], []);
    expect(p.gesamt).toBe("moeglich");
    expect(p.liquiditaet.status).toBe("ok");
    if (p.liquiditaet.status === "ok") expect(p.liquiditaet.hoechstens.toString()).toBe("50000");
    expect(p.covenantStatus).toBe("keine");
  });

  it("blockiert bei Unterschreitung oder aktiver Sperre", () => {
    expect(pruefeAusschuettung(plan([100000, 40000, 120000, 90000], 50000), "2027-01-01", dezimal(20000), [], []).gesamt).toBe("blockiert");
    expect(pruefeAusschuettung(plan([100000, 80000, 120000, 90000]), "2027-01-01", dezimal(1), [{ kreditId: "k", kennzahl: "DSCR", status: "aktiv" }], []).gesamt).toBe("blockiert");
    expect(pruefeAusschuettung(plan([100000, -1, 120000, 90000]), "2026-12-01", dezimal(1), [], []).liquiditaet.status).toBe("engpass");
  });

  it("verlangt Prüfung bei unbekanntem Bestand, manueller Sperre oder außerhalb des Plans", () => {
    expect(pruefeAusschuettung(plan([null, null, null, null]), "2027-01-01", dezimal(1), [], []).gesamt).toBe("pruefen");
    expect(pruefeAusschuettung(plan([1, 1, 1, 1]), "2027-01-01", dezimal(1), [{ kreditId: "k", kennzahl: "X", status: "manuell" }], []).gesamt).toBe("pruefen");
    expect(pruefeAusschuettung(plan([1, 1, 1, 1]), "2027-06-01", dezimal(1), [], []).liquiditaet.status).toBe("ausserhalb");
  });

  it("verteilt nach Beteiligung und lässt unbekannte Anteile offen", () => {
    const v = verteilung(dezimal(100000), [
      { id: "a", name: "A", beteiligungProzent: dezimal(60) },
      { id: "b", name: "B", beteiligungProzent: dezimal(40) },
    ]);
    expect(v.zeilen.map((z) => z.betrag?.toString())).toEqual(["60000", "40000"]);
    expect(v.vollstaendig).toBe(true);
    const u = verteilung(dezimal(100), [{ id: "a", name: "A", beteiligungProzent: null }]);
    expect(u.zeilen[0].betrag).toBeNull();
    expect(u.vollstaendig).toBe(false);
  });
});
