import { describe, expect, it } from "vitest";
import { covenantPuffer, sperrenStatus } from "@/lib/covenant";
import { dezimal } from "@/lib/geld";
import { covenantKennzahlen, kennzahlenAus, leereSummen } from "@/lib/kennzahlen";
import { ermittleWarnungen, type CovenantDaten } from "@/lib/warnungen";
import { erzeugePortfolio, STICHTAG } from "../prisma/testdaten/portfolio";
import { alsDaten } from "./hilfen/testportfolio";

function kz(werte: { verkehrswert?: number; restschuld?: number; istMonat?: number; zinsen?: number; tilgung?: number }) {
  const s = leereSummen();
  s.verkehrswert = dezimal(werte.verkehrswert ?? 0);
  s.restschuld = dezimal(werte.restschuld ?? 0);
  s.istMonat = dezimal(werte.istMonat ?? 0);
  s.zinsenJahr = dezimal(werte.zinsen ?? 0);
  s.tilgungJahr = dezimal(werte.tilgung ?? 0);
  s.luecken.verkehrswert.bekannt = 1;
  s.luecken.restschuld.bekannt = 1;
  s.luecken.kapitaldienst.bekannt = 1;
  return kennzahlenAus(s);
}

describe("Covenant-Headroom", () => {
  it("LTV höchstens 65 %: Abstand und Spielraum von Verkehrswert und Restschuld", () => {
    // LTV = 600.000 / 1.000.000 = 60 %
    const p = covenantPuffer({ kennzahl: "LTV", vergleich: "HOECHSTENS", schwellenwert: dezimal(65) }, kz({ verkehrswert: 1_000_000, restschuld: 600_000 }))!;
    expect(p.eingehalten).toBe(true);
    expect(p.abstand.toFixed(2)).toBe("5.00");
    expect(p.abstandRelativ!.toFixed(2)).toBe("7.69");
    const vw = p.spielraum.find((s) => s.art === "verkehrswertRueckgang")!;
    // Grenze: 600.000 / 0,65 = 923.076,92 → Rückgang 76.923,08 (7,69 %)
    expect(vw.betrag.toFixed(2)).toBe("76923.08");
    expect(vw.prozent.toFixed(2)).toBe("7.69");
    expect(p.spielraum.find((s) => s.art === "restschuldAnstieg")!.betrag.toFixed(2)).toBe("50000.00");
  });

  it("DSCR mindestens 1,2: Miete darf bis zum 1,2-fachen Kapitaldienst sinken", () => {
    // Miete 120.000/Jahr, Kapitaldienst 80.000 → DSCR 1,5
    const p = covenantPuffer({ kennzahl: "DSCR", vergleich: "MINDESTENS", schwellenwert: dezimal("1.2") }, kz({ istMonat: 10_000, zinsen: 50_000, tilgung: 30_000 }))!;
    expect(p.wert.toFixed(2)).toBe("1.50");
    expect(p.spielraum.find((s) => s.art === "mieteRueckgang")!.betrag.toFixed(2)).toBe("24000.00");
    expect(p.spielraum.find((s) => s.art === "kapitaldienstAnstieg")!.betrag.toFixed(2)).toBe("20000.00");
  });

  it("verletzt: negativer Puffer = was fehlt; nicht prüfbar: null und Sperrenstatus manuell", () => {
    const p = covenantPuffer({ kennzahl: "DSCR", vergleich: "MINDESTENS", schwellenwert: dezimal("2") }, kz({ istMonat: 10_000, zinsen: 50_000, tilgung: 30_000 }))!;
    expect(p.eingehalten).toBe(false);
    expect(p.spielraum.find((s) => s.art === "mieteRueckgang")!.betrag.toFixed(2)).toBe("-40000.00");
    expect(sperrenStatus(p)).toBe("aktiv");
    expect(covenantPuffer({ kennzahl: "Jahresabschluss", vergleich: null, schwellenwert: null }, kz({}))).toBeNull();
    expect(sperrenStatus(null)).toBe("manuell");
  });

  it("Testportfolio: Ausschüttungssperren bei K06 (DSCR) und K12 (LTV) sind aktiv", () => {
    const p = erzeugePortfolio();
    const { haeuser, kredite } = alsDaten(p);
    const covenants: CovenantDaten[] = p.kredite.flatMap((k) =>
      k.covenants.map((c) => ({ kreditId: k.schluessel, kennzahl: c.kennzahl, vergleich: c.vergleich, schwellenwert: c.schwellenwert ? dezimal(c.schwellenwert) : null, folge: c.folge })),
    );
    const sperren = ermittleWarnungen(haeuser, kredite, covenants, [], STICHTAG).flatMap((w) => (w.art === "sperre" && w.stufe === "hoch" ? [w.kreditId] : []));
    expect(sperren.sort()).toEqual(["K06", "K12"]);
    const k12 = kredite.find((k) => k.id === "K12")!;
    const puffer = covenantPuffer({ kennzahl: "LTV", vergleich: "HOECHSTENS", schwellenwert: dezimal(65) }, covenantKennzahlen(k12, haeuser, kredite, [], STICHTAG))!;
    expect(puffer.abstand.isNegative()).toBe(true);
  });
});
