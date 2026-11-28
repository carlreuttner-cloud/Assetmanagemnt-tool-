import { describe, expect, it } from "vitest";
import { erstelleNachweis, gesamtErgebnis, letzterTesttermin, testTermine } from "@/lib/covenant-nachweis";
import { pdfText } from "@/lib/pdf/schreiber";
import { dezimal } from "@/lib/geld";
import type { HausDaten } from "@/lib/kennzahlen";
import type { KreditDaten } from "@/lib/kredit";

describe("Testtermine", () => {
  it("hält Monatsenden und läuft im Abstand", () => {
    expect(testTermine("2025-12-31", 6, "2026-01-01", "2027-01-01")).toEqual(["2026-06-30", "2026-12-31"]);
    expect(testTermine("2025-06-30", 3, "2026-01-01", "2026-12-31")).toEqual(["2026-03-31", "2026-06-30", "2026-09-30", "2026-12-31"]);
    expect(testTermine("2026-01-15", 1, "2026-03-01", "2026-04-30")).toEqual(["2026-03-15", "2026-04-15"]);
  });
  it("findet den letzten Termin bis zum Stichtag", () => {
    expect(letzterTesttermin("2025-12-31", 12, "2026-11-28")).toBe("2025-12-31");
    expect(letzterTesttermin("2025-06-30", 6, "2026-11-28")).toBe("2026-06-30");
    expect(letzterTesttermin("2027-01-01", 12, "2026-11-28")).toBeNull();
  });
});

const haus = (id: string, vw: string | null): HausDaten => ({ id, gesellschaftId: "g", kaufpreis: null, verkehrswerte: vw ? [{ stichtag: "2026-01-01", wert: dezimal(vw) }] : [], einheiten: [] });
const kredit = (saldo: string | null): KreditDaten =>
  ({
    id: "k1",
    gesellschaftId: "g",
    bezeichnung: "K1",
    zinsArt: "FEST",
    sollzins: dezimal(3),
    referenzzins: null,
    marge: null,
    ursprungsbetrag: dezimal(1000000),
    auszahlungsdatum: "2020-01-01",
    zinsbindungBis: null,
    laufzeitBis: null,
    zahlweise: "MONATLICH",
    tilgungsart: "ANNUITAET",
    anfaenglicheTilgung: null,
    ratenbetrag: null,
    haeuser: [{ hausId: "h1", anteilProzent: dezimal(100) }],
    buchungen: [],
    salden: saldo ? [{ art: "DARLEHEN", status: "BELEGT", stichtag: "2026-06-30", betrag: dezimal(saldo), quelle: "KONTOAUSZUG" }] : [],
    tilgungsplaene: [],
  }) as unknown as KreditDaten;

const eingabe = (vw: string | null, saldo: string | null) => {
  const k = kredit(saldo);
  return {
    stichtag: "2026-06-30",
    erstelltAm: new Date("2026-07-01T10:00:00Z"),
    erstelltVon: "Test",
    mandant: "M",
    kredit: { ...k, bank: "Bank", kreditnummer: "123", gesellschaft: "G" },
    haeuser: [haus("h1", vw)],
    alleKredite: [k],
    referenzwerte: [],
    covenants: [{ kennzahl: "LTV", folge: "COVENANT" as const, vergleich: "HOECHSTENS" as const, schwellenwert: dezimal(65), beschreibung: null }],
    namen: { haus: new Map([["h1", "Haus 1"]]), kredit: new Map([["k1", "K1"]]) },
    verkehrswertQuelle: () => "Gutachten",
  };
};

describe("Covenant-Nachweis", () => {
  it("prüft den LTV aus belegtem Saldo und Verkehrswert", () => {
    const n = erstelleNachweis(eingabe("1000000", "600000"));
    expect(n.kennzahlen.LTV).toBe("60");
    expect(n.covenants[0].eingehalten).toBe(true);
    expect(n.covenants[0].abstand).toBe("5");
    expect(n.haeuser[0].verkehrswert?.quelle).toBe("Gutachten");
    expect(gesamtErgebnis(n)).toBe("eingehalten");
  });
  it("meldet Lücken und bleibt offen ohne Saldo", () => {
    const n = erstelleNachweis(eingabe("1000000", null));
    expect(n.covenants[0].eingehalten).toBeNull();
    expect(n.luecken.map((l) => l.art)).toContain("restschuld");
    expect(gesamtErgebnis(n)).toBe("offen");
  });
  it("erkennt Verletzungen", () => {
    expect(gesamtErgebnis(erstelleNachweis(eingabe("1000000", "700000")))).toBe("verletzt");
  });
  it("ersetzt Zeichen, die die PDF-Schrift nicht kennt", () => {
    expect(pdfText("a ≤ b − c ⓘ € ä\nx")).toBe("a <= b - c ? € ä\nx");
  });
});
