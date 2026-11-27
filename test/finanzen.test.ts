import { describe, expect, it } from "vitest";
import { dezimal } from "@/lib/geld";
import { finanzVerlauf, jahresKennzahlen, kreditAbgleich, ALLE_POSTEN, type JahresDaten } from "@/lib/finanzen";
import type { KreditDaten } from "@/lib/kredit";

function jahr(j: number, werte: Partial<Record<(typeof ALLE_POSTEN)[number], number | null>> = {}): JahresDaten {
  const basis: Record<string, number | null> = {
    umsatzerloese: 1_000_000, sonstigeErtraege: 10_000, materialaufwand: 180_000, personalaufwand: 0, sonstigeAufwendungen: 50_000,
    abschreibungen: 200_000, zinsertraege: 1_000, zinsaufwendungen: 300_000, steuern: 40_000, jahresergebnis: 241_000,
    anlagevermoegen: 20_000_000, umlaufvermoegen: 100_000, liquideMittel: 500_000, eigenkapital: 6_000_000, rueckstellungen: 50_000,
    verbindlichkeitenBanken: 14_000_000, sonstigeVerbindlichkeiten: 550_000,
    cashflowLaufend: 450_000, cashflowInvestition: -100_000, cashflowFinanzierung: -250_000,
    ...werte,
  };
  return {
    id: String(j), jahr: j, beginn: `${j}-01-01`, ende: `${j}-12-31`, quelle: "JAHRESABSCHLUSS", quelleText: null, status: "ENDGUELTIG",
    ...(Object.fromEntries(ALLE_POSTEN.map((p) => [p, basis[p] === null ? null : dezimal(basis[p]!)])) as Record<(typeof ALLE_POSTEN)[number], ReturnType<typeof dezimal> | null>),
  };
}

describe("Finanzen je Geschäftsjahr", () => {
  it("leitet EBITDA, EBIT, EBT und Jahresergebnis her", () => {
    const k = jahresKennzahlen(jahr(2024), null);
    expect(k.ebitda!.toFixed()).toBe("780000");
    expect(k.ebit!.toFixed()).toBe("580000");
    expect(k.ebt!.toFixed()).toBe("281000");
    expect(k.jahresergebnisRechnerisch!.toFixed()).toBe("241000");
    expect(k.ergebnisAbweichung!.toFixed()).toBe("0");
    expect(k.bilanzDifferenz!.toFixed()).toBe("0");
    expect(k.ebitdaMarge!.toFixed(1)).toBe("78.0");
    expect(k.zinsdeckung!.toFixed(2)).toBe("2.60");
    expect(k.nettoverschuldung!.toFixed()).toBe("13500000");
  });

  it("lässt Größen mit fehlenden Posten unbekannt statt 0", () => {
    const k = jahresKennzahlen(jahr(2024, { personalaufwand: null, liquideMittel: null }), null);
    expect(k.ebitda).toBeNull();
    expect(k.ebit).toBeNull();
    expect(k.ebitdaMarge).toBeNull();
    expect(k.aktiva).toBeNull();
    expect(k.nettoverschuldung).toBeNull();
    expect(k.passiva).not.toBeNull();
  });

  it("vergleicht Cashflow und liquide Mittel nur mit dem direkten Vorjahr", () => {
    const vj = jahr(2023, { liquideMittel: 400_000 });
    const k = jahresKennzahlen(jahr(2024), vj);
    expect(k.liquiditaetsveraenderung!.toFixed()).toBe("100000");
    expect(k.cashflowDifferenz!.toFixed()).toBe("0");
    expect(jahresKennzahlen(jahr(2024), jahr(2022)).liquiditaetsveraenderung).toBeNull();
  });

  it("zeigt fehlende Geschäftsjahre als Lücke", () => {
    const v = finanzVerlauf([jahr(2021), jahr(2023), jahr(2024)]);
    expect(v.map((s) => [s.jahr, s.daten ? "da" : "fehlt"])).toEqual([[2021, "da"], [2022, "fehlt"], [2023, "da"], [2024, "da"]]);
    expect(v[2].k!.liquiditaetsveraenderung).toBeNull();
  });

  it("gleicht Bankverbindlichkeiten nur mit belegten Salden zum Bilanzstichtag ab", () => {
    const kredit = (bezeichnung: string, salden: KreditDaten["salden"]) => ({ bezeichnung, auszahlungsdatum: "2020-01-01", salden }) as KreditDaten;
    const s = (betrag: number, stichtag: string, status: "BELEGT" | "ENTWURF" = "BELEGT") =>
      ({ stichtag, art: "DARLEHEN", betrag: dezimal(betrag), quelle: "BANKBESTAETIGUNG", status }) as const;
    const j = { ende: "2024-12-31", verbindlichkeitenBanken: dezimal(14_000_000) };
    const a = kreditAbgleich(j, [kredit("A", [s(9_000_000, "2024-12-31")]), kredit("B", [s(4_990_000, "2024-12-31")])]);
    expect(a.summe!.toFixed()).toBe("13990000");
    expect(a.differenz!.toFixed()).toBe("10000");
    const b = kreditAbgleich(j, [kredit("A", [s(9_000_000, "2024-12-31")]), kredit("B", [s(4_990_000, "2024-12-31", "ENTWURF")])]);
    expect(b.summe).toBeNull();
    expect(b.ohneSaldo).toEqual(["B"]);
  });
});
