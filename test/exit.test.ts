import { describe, expect, it } from "vitest";
import { dezimal } from "@/lib/geld";
import { bewerteHaus } from "@/lib/bewertung";
import type { HausDaten } from "@/lib/kennzahlen";
import type { KreditDaten } from "@/lib/kredit";
import { gewaehlterPreis, preisvorschlaege, rechneExit, restschuldZum, type ExitParameter } from "@/lib/exit";

const HEUTE = "2026-11-27";
const haus: HausDaten = {
  id: "H1",
  gesellschaftId: "G1",
  kaufpreis: dezimal(800000),
  verkehrswerte: [],
  einheiten: [
    { id: "E1", art: "WOHNUNG", flaeche: dezimal(100), erwarteteMiete: null, mietverhaeltnisse: [{ beginn: "2020-01-01", ende: null, istMiete: dezimal(4000), sollMiete: dezimal(5000), rueckstand: dezimal(0) }] },
  ],
};

function kredit(teil: Partial<KreditDaten> = {}): KreditDaten {
  return {
    id: "K1",
    gesellschaftId: "G1",
    bezeichnung: "Darlehen",
    zinsArt: "FEST",
    sollzins: dezimal(3),
    referenzzins: null,
    marge: null,
    ursprungsbetrag: dezimal(600000),
    auszahlungsdatum: "2020-01-01",
    zinsbindungBis: "2030-12-31",
    laufzeitBis: null,
    zahlweise: "MONATLICH",
    tilgungsart: "ANNUITAET",
    anfaenglicheTilgung: null,
    ratenbetrag: dezimal(2500),
    haeuser: [{ hausId: "H1", anteilProzent: dezimal(50) }, { hausId: "H2", anteilProzent: dezimal(50) }],
    buchungen: [],
    salden: [{ stichtag: "2026-10-31", art: "DARLEHEN", betrag: dezimal(500000), quelle: "KONTOAUSZUG", status: "BELEGT" }],
    tilgungsplaene: [],
    ...teil,
  };
}

const param = (teil: Partial<ExitParameter> = {}): ExitParameter => ({
  verkaufsdatum: "2027-12-31",
  basis: "frei",
  preis: dezimal(1000000),
  faktor: null,
  maklerProzent: dezimal(3),
  sonstigeProzent: dezimal(1),
  vfeProzent: null,
  ...teil,
});

describe("Exit-Kalkulation", () => {
  it("Preisvorschläge: Miete × Faktor aus Gutachten oder Eingabe, Marktwert und Gutachten mit Stichtag", () => {
    const b = bewerteHaus(
      [{ id: "G", hausId: "H1", stichtag: "2025-12-31", verkehrswert: dezimal(1200000), bodenwert: null, gebaeudewert: null, gutachter: "X" }],
      [{ id: "M", hausId: "H1", stichtag: "2026-06-30", wert: dezimal(1150000), quelle: "Bank" }],
    );
    const v = preisvorschlaege(haus, b, { wert: dezimal(20), stichtag: "2025-12-31" }, null, HEUTE);
    expect(v.miete.jahresmiete.toFixed(2)).toBe("60000.00"); // Soll 5.000 × 12
    expect(v.miete.preis!.toFixed(0)).toBe("1200000");
    expect(v.miete.faktorQuelle).toBe("gutachten");
    expect(preisvorschlaege(haus, b, null, dezimal(18), HEUTE).miete.preis!.toFixed(0)).toBe("1080000");
    expect(preisvorschlaege(haus, b, null, null, HEUTE).miete.preis).toBeNull();
    expect(gewaehlterPreis(v, { basis: "marktwert", preis: null })!.toFixed(0)).toBe("1150000");
    expect(gewaehlterPreis(v, { basis: "gutachten", preis: null })!.toFixed(0)).toBe("1200000");
  });

  it("Ablöse = Restschuld × Anteil; Festzins in der Bindung braucht eine VFE-Angabe", () => {
    const e = rechneExit("H1", dezimal(1000000), param(), [kredit()], [], HEUTE, { kaufpreis: dezimal(800000), investitionen: dezimal(50000) });
    expect(e.nettoErloes!.toFixed(0)).toBe("960000");
    const k = e.kredite[0];
    expect(k.herkunft).toBe("berechnet");
    expect(k.restschuld!.lessThan(500000) && k.restschuld!.greaterThan(480000)).toBe(true);
    expect(k.abloese!.toFixed(2)).toBe(k.restschuld!.dividedBy(2).toDecimalPlaces(2).toFixed(2));
    expect(k.vfePflichtig).toBe(true);
    expect(e.vfe).toBeNull();
    expect(e.ergebnis).toBeNull();
    expect(e.luecken).toContain("vfe");
    expect(e.wertzuwachs!.toFixed(0)).toBe("110000");

    const mit = rechneExit("H1", dezimal(1000000), param({ vfeProzent: dezimal(2) }), [kredit()], [], HEUTE, { kaufpreis: null, investitionen: dezimal(0) });
    expect(mit.vfe!.toFixed(2)).toBe(mit.kredite[0].abloese!.times("0.02").toDecimalPlaces(2).toFixed(2));
    expect(mit.ergebnis!.toFixed(2)).toBe(mit.nettoErloes!.minus(mit.abloese!).minus(mit.vfe!).toFixed(2));
    expect(mit.wertzuwachs).toBeNull();
  });

  it("nach Ende der Zinsbindung keine VFE; Vergangenheit aus Belegen; ohne Saldo unbekannt", () => {
    const e = rechneExit("H1", dezimal(1000000), param({ verkaufsdatum: "2031-06-30" }), [kredit()], [], HEUTE, { kaufpreis: null, investitionen: dezimal(0) });
    expect(e.kredite[0].vfePflichtig).toBe(false);
    expect(e.ergebnis).not.toBeNull();
    expect(restschuldZum(kredit(), "2026-11-15", HEUTE, [])).toEqual({ betrag: dezimal(500000), herkunft: "belegt", stichtag: "2026-10-31" });
    const ohne = rechneExit("H1", dezimal(1000000), param(), [kredit({ salden: [] })], [], HEUTE, { kaufpreis: null, investitionen: dezimal(0) });
    expect(ohne.abloese).toBeNull();
    expect(ohne.luecken).toContain("restschuld");
  });

  it("Tilgungsplan geht der Fortrechnung vor", () => {
    const k = kredit({
      tilgungsplaene: [
        {
          version: 1,
          gueltigAb: "2020-01-01",
          zeilen: [
            { faelligAm: "2027-12-31", zins: dezimal(1), tilgung: dezimal(1), rate: dezimal(2), restschuld: dezimal(470000) },
            { faelligAm: "2028-01-31", zins: dezimal(1), tilgung: dezimal(1), rate: dezimal(2), restschuld: dezimal(469000) },
          ],
        },
      ],
    });
    expect(restschuldZum(k, "2027-12-31", HEUTE, [])).toEqual({ betrag: dezimal(470000), herkunft: "tilgungsplan", stichtag: "2027-12-31" });
  });
});
