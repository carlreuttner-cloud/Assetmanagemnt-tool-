import { describe, expect, it } from "vitest";
import { darfFreigeben, erstelleQuartalsbericht, letztesQuartal, quartalsende, vorquartal } from "@/lib/quartalsbericht";
import { dezimal } from "@/lib/geld";
import type { HausDaten } from "@/lib/kennzahlen";
import type { KreditDaten } from "@/lib/kredit";

describe("Quartale", () => {
  it("bestimmt Quartalsenden und das letzte abgeschlossene Quartal", () => {
    expect(quartalsende(2026, 1)).toBe("2026-03-31");
    expect(quartalsende(2026, 4)).toBe("2026-12-31");
    expect(letztesQuartal("2026-11-28")).toEqual({ jahr: 2026, quartal: 3 });
    expect(letztesQuartal("2026-09-30")).toEqual({ jahr: 2026, quartal: 3 });
    expect(letztesQuartal("2026-02-10")).toEqual({ jahr: 2025, quartal: 4 });
    expect(vorquartal(2026, 1)).toEqual({ jahr: 2025, quartal: 4 });
  });
  it("lässt nur eine andere Person freigeben", () => {
    expect(darfFreigeben({ status: "ENTWURF", erstelltVonId: "a" }, "a")).toBe("selbst");
    expect(darfFreigeben({ status: "ENTWURF", erstelltVonId: "a" }, "b")).toBe("ja");
    expect(darfFreigeben({ status: "FREIGEGEBEN", erstelltVonId: "a" }, "b")).toBe("status");
  });
});

describe("Quartalsbericht", () => {
  const haus: HausDaten = {
    id: "h1",
    gesellschaftId: "g1",
    kaufpreis: null,
    verkehrswerte: [
      { stichtag: "2025-12-31", wert: dezimal(1000000) },
      { stichtag: "2026-08-31", wert: dezimal(1100000) },
    ],
    einheiten: [{ id: "e1", art: "WOHNUNG", flaeche: dezimal(100), erwarteteMiete: null, mietverhaeltnisse: [{ beginn: "2020-01-01", ende: null, istMiete: dezimal(2000), sollMiete: dezimal(2000), rueckstand: dezimal(0) }] }],
  } as unknown as HausDaten;
  const kredit = {
    id: "k1",
    gesellschaftId: "g1",
    bezeichnung: "K1",
    zinsArt: "FEST",
    sollzins: dezimal(3),
    referenzzins: null,
    marge: null,
    ursprungsbetrag: dezimal(800000),
    auszahlungsdatum: "2020-01-01",
    zinsbindungBis: "2027-03-31",
    laufzeitBis: null,
    zahlweise: "MONATLICH",
    tilgungsart: "ANNUITAET",
    anfaenglicheTilgung: null,
    ratenbetrag: null,
    haeuser: [{ hausId: "h1", anteilProzent: dezimal(100) }],
    buchungen: [],
    salden: [{ art: "DARLEHEN", status: "BELEGT", stichtag: "2026-09-30", betrag: dezimal(600000), quelle: "KONTOAUSZUG" }],
    tilgungsplaene: [],
  } as unknown as KreditDaten;
  const b = erstelleQuartalsbericht({
    umfang: { art: "portfolio", name: "Portfolio" },
    mandant: "M",
    jahr: 2026,
    quartal: 3,
    erstelltAm: new Date("2026-10-05T10:00:00Z"),
    erstelltVon: "A",
    haeuser: [haus],
    kredite: [kredit],
    referenzwerte: [],
    namen: { haus: new Map([["h1", "Haus 1"]]), kredit: new Map([["k1", { name: "K1", bank: "Bank" }]]), gesellschaft: new Map([["g1", "G1"]]) },
    covenants: [{ kreditId: "k1", kennzahl: "LTV", folge: "COVENANT", vergleich: "HOECHSTENS", schwellenwert: dezimal(60) }],
    kontostaende: [],
    gesellschaftIds: ["g1"],
  });

  it("friert Werte zum Quartalsende ein und vergleicht mit dem Vorquartal", () => {
    expect(b.stichtag).toBe("2026-09-30");
    expect(b.aktuell.verkehrswert).toBe("1100000");
    expect(b.vorquartal.stichtag).toBe("2026-06-30");
    expect(b.vorquartal.verkehrswert).toBe("1000000");
    expect(b.aktuell.restschuld).toBe("600000");
    expect(b.vorquartal.restschuld).toBeNull();
    expect(b.aktuell.istJahr).toBe("24000");
    expect(b.covenants[0].status).toBe("frei");
  });
  it("führt Lücken statt 0 und nennt Fristen der nächsten 12 Monate", () => {
    expect(b.liquiditaet.summe).toBeNull();
    expect(b.liquiditaet.ohneKontostand).toEqual(["G1"]);
    expect(b.fristen).toEqual([{ art: "zinsbindung", datum: "2027-03-31", kredit: "K1" }]);
  });
});
