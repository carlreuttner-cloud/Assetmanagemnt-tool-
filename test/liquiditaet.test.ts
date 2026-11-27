import { describe, expect, it } from "vitest";
import { dezimal } from "@/lib/geld";
import type { HausDaten } from "@/lib/kennzahlen";
import type { KreditDaten } from "@/lib/kredit";
import { aktuelleKontostaende, rechneLiquiditaet, verteileRestbudget, type LiquiditaetEingabe } from "@/lib/liquiditaet";
import { monatsNummer } from "@/lib/datum";

const HEUTE = "2026-11-27";

const haus: HausDaten = {
  id: "H1",
  gesellschaftId: "G1",
  kaufpreis: null,
  verkehrswerte: [],
  einheiten: [
    {
      id: "E1",
      art: "WOHNUNG",
      flaeche: dezimal(80),
      erwarteteMiete: null,
      mietverhaeltnisse: [
        { beginn: "2020-01-01", ende: null, istMiete: dezimal(1000), sollMiete: dezimal(1000), rueckstand: dezimal(0) },
        // endet am 31.03.2027: ab April keine Miete mehr
        { beginn: "2021-01-01", ende: "2027-03-31", istMiete: dezimal(500), sollMiete: dezimal(500), rueckstand: dezimal(0) },
      ],
    },
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
    ursprungsbetrag: dezimal(120000),
    auszahlungsdatum: "2020-01-01",
    zinsbindungBis: "2030-12-31",
    laufzeitBis: null,
    zahlweise: "MONATLICH",
    tilgungsart: "ANNUITAET",
    anfaenglicheTilgung: null,
    ratenbetrag: dezimal(500),
    haeuser: [{ hausId: "H1", anteilProzent: dezimal(100) }],
    buchungen: [],
    salden: [{ stichtag: "2026-10-31", art: "DARLEHEN", betrag: dezimal(100000), quelle: "KONTOAUSZUG", status: "BELEGT" }],
    tilgungsplaene: [],
    ...teil,
  };
}

const basis = (teil: Partial<LiquiditaetEingabe> = {}): LiquiditaetEingabe => ({
  haeuser: [haus],
  kredite: [kredit()],
  referenzwerte: [],
  massnahmen: [],
  positionen: [],
  kontostaende: [{ id: "S1", konto: "Giro", stichtag: "2026-11-20", betrag: dezimal(2000), quelle: "Kontoauszug" }],
  mindestliquiditaet: null,
  heute: HEUTE,
  ...teil,
});

describe("Liquiditätsplanung", () => {
  it("plant 12 Monate ab dem Folgemonat mit Mieten bis Vertragsende und Annuität aus belegtem Saldo", () => {
    const p = rechneLiquiditaet(basis());
    expect(p.beginn).toBe("2026-12-01");
    expect(p.ende).toBe("2027-11-30");
    expect(p.monate).toHaveLength(12);
    expect(p.monate[0].mieten.toFixed(2)).toBe("1500.00");
    expect(p.monate[4].mieten.toFixed(2)).toBe("1000.00"); // April 2027
    // Dezember: Zins 3 %/12 auf 100.000 = 250, Tilgung 250
    expect(p.monate[0].zins.toFixed(2)).toBe("250.00");
    expect(p.monate[0].tilgung.toFixed(2)).toBe("250.00");
    expect(p.monate[1].zins.toFixed(2)).toBe("249.38");
    expect(p.monate[0].saldo.toFixed(2)).toBe("1000.00");
    expect(p.monate[0].bestand!.toFixed(2)).toBe("3000.00");
    expect(p.vollstaendig).toBe(true);
    expect(p.ersterEngpass).toBeNull();
  });

  it("meldet Engpass und Unterschreitung der Mindestliquidität", () => {
    const p = rechneLiquiditaet(
      basis({
        mindestliquiditaet: dezimal(2500),
        positionen: [{ id: "P1", art: "AUSSCHUETTUNG", monat: "2027-02-01", betrag: dezimal(8000), bezeichnung: "Ausschüttung" }],
      }),
    );
    expect(p.monate[0].status).toBe("ok");
    expect(p.monate[2].status).toBe("engpass"); // Feb: 2000 + 3×1000 − 8000 < 0
    expect(p.ersterEngpass).toBe("2027-02-01");
    expect(p.monate[2].ausschuettungen.toFixed(2)).toBe("8000.00");
    expect(p.tiefsterBestand!.monat).toBe("2027-02-01");
  });

  it("ohne Kontostand ist der Bestand unbekannt, Salden werden trotzdem gerechnet", () => {
    const p = rechneLiquiditaet(basis({ kontostaende: [] }));
    expect(p.anfangsbestand.summe).toBeNull();
    expect(p.monate[0].bestand).toBeNull();
    expect(p.monate[0].status).toBeNull();
    expect(p.monate[0].saldo.toFixed(2)).toBe("1000.00");
  });

  it("Kredit ohne belegten Saldo ist eine Lücke, nichts wird geschätzt", () => {
    const p = rechneLiquiditaet(basis({ kredite: [kredit({ salden: [] })] }));
    expect(p.luecken.kredite).toEqual([{ kreditId: "K1", grund: "saldo" }]);
    expect(p.vollstaendig).toBe(false);
    expect(p.monate[0].zins.isZero()).toBe(true);
  });

  it("nimmt die Zeile des Tilgungsplans und die Schlusszahlung am Laufzeitende", () => {
    const k = kredit({
      laufzeitBis: "2027-01-31",
      tilgungsplaene: [
        {
          version: 1,
          gueltigAb: "2026-01-01",
          zeilen: [
            { faelligAm: "2026-12-31", zins: dezimal(300), tilgung: dezimal(200), rate: dezimal(500), restschuld: dezimal(99800) },
            { faelligAm: "2027-01-31", zins: dezimal(299), tilgung: dezimal(201), rate: dezimal(500), restschuld: dezimal(99599) },
          ],
        },
      ],
    });
    const p = rechneLiquiditaet(basis({ kredite: [k] }));
    expect(p.monate[0].kredite[0].quelle).toBe("tilgungsplan");
    expect(p.monate[0].zins.toFixed(2)).toBe("300.00");
    expect(p.monate[1].schlusszahlung.toFixed(2)).toBe("99599.00");
    expect(p.monate[2].zins.isZero()).toBe(true);
    expect(p.ersterEngpass).toBe("2027-01-01");
  });

  it("quartalsweise Zahlung am Quartalsende", () => {
    const p = rechneLiquiditaet(basis({ kredite: [kredit({ zahlweise: "QUARTALSWEISE", ratenbetrag: dezimal(1500) })] }));
    const mitZahlung = p.monate.filter((m) => !m.zins.isZero()).map((m) => m.monat);
    expect(mitZahlung).toEqual(["2026-12-01", "2027-03-01", "2027-06-01", "2027-09-01"]);
  });

  it("verteilt das Restbudget offener Maßnahmen gleichmäßig bis zum Ende", () => {
    const start = monatsNummer("2026-12-01");
    const v = verteileRestbudget(
      { id: "M1", bezeichnung: "Dach", status: "LAUFEND", budget: dezimal(10000), ist: dezimal(4000), beginn: "2026-06-01", ende: "2027-02-28" },
      start,
    );
    expect([...v.verteilung.values()].map((x) => x.toFixed(2))).toEqual(["2000.00", "2000.00", "2000.00"]);
    expect(verteileRestbudget({ id: "M2", bezeichnung: "x", status: "GEPLANT", budget: null, ist: dezimal(0), beginn: null, ende: null }, start).luecke).toBe("budget");
    expect(verteileRestbudget({ id: "M3", bezeichnung: "x", status: "GEPLANT", budget: dezimal(1), ist: dezimal(0), beginn: null, ende: null }, start).luecke).toBe("ende");
    const alt = verteileRestbudget({ id: "M4", bezeichnung: "x", status: "LAUFEND", budget: dezimal(900), ist: dezimal(0), beginn: null, ende: "2026-10-31" }, start);
    expect(alt.ueberfaellig).toBe(true);
    expect(alt.verteilung.get(start)!.toFixed(2)).toBe("900.00");
    // Rundungsrest im letzten Monat
    const drei = verteileRestbudget({ id: "M5", bezeichnung: "x", status: "GEPLANT", budget: dezimal(100), ist: dezimal(0), beginn: null, ende: "2027-02-28" }, start);
    expect([...drei.verteilung.values()].map((x) => x.toFixed(2))).toEqual(["33.33", "33.33", "33.34"]);
  });

  it("nimmt je Konto den jüngsten Stand bis heute", () => {
    const k = aktuelleKontostaende(
      [
        { id: "1", konto: "Giro", stichtag: "2026-10-31", betrag: dezimal(1), quelle: null },
        { id: "2", konto: "Giro", stichtag: "2026-11-20", betrag: dezimal(2), quelle: null },
        { id: "3", konto: "Giro", stichtag: "2026-12-31", betrag: dezimal(3), quelle: null },
        { id: "4", konto: "Tagesgeld", stichtag: "2026-09-30", betrag: dezimal(4), quelle: null },
      ],
      HEUTE,
    );
    expect(k.map((x) => x.id)).toEqual(["2", "4"]);
  });
});
