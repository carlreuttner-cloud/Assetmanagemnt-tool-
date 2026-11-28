import { describe, expect, it } from "vitest";
import { dezimal } from "@/lib/geld";
import type { KreditDaten, ZinssicherungDaten } from "@/lib/kredit";
import { gruppenRisiko, kreditRisiko, schockAus } from "@/lib/zinsrisiko";

const heute = "2026-11-28";
const kredit = (id: string, o: Partial<KreditDaten> & { saldo?: string | null }): KreditDaten =>
  ({
    id,
    gesellschaftId: "g1",
    bezeichnung: id,
    zinsArt: "FEST",
    sollzins: null,
    referenzzins: null,
    marge: null,
    zinsbindungBis: null,
    laufzeitBis: null,
    auszahlungsdatum: "2020-01-01",
    haeuser: [],
    buchungen: [],
    tilgungsplaene: [],
    ...o,
    salden: o.saldo != null ? [{ art: "DARLEHEN", status: "BELEGT", stichtag: "2026-10-31", betrag: dezimal(o.saldo), quelle: "KONTOAUSZUG" }] : [],
  }) as unknown as KreditDaten;
const ref = [{ referenz: "EURIBOR3M", stichtag: "2026-10-31", satz: dezimal("2") }];
const swap = (nominal: string | null, ende: string): ZinssicherungDaten => ({ id: "s", art: "SWAP", satz: dezimal("2.5"), nominal: nominal === null ? null : dezimal(nominal), beginn: "2024-01-01", ende });

describe("Zinsrisiko", () => {
  it("prüft den Schock-Parameter", () => {
    expect(schockAus("200")).toBe(200);
    expect(schockAus("0")).toBe(100);
    expect(schockAus("abc")).toBe(100);
    expect(schockAus(undefined)).toBe(100);
  });

  it("Festzins: Anstieg nur in Monaten nach dem Ende der Bindung", () => {
    const lang = kreditRisiko(kredit("a", { sollzins: dezimal("1.5"), zinsbindungBis: "2030-11-30", saldo: "1000000" }), [], heute, 100)!;
    expect(lang.kategorie).toBe("fest");
    expect(lang.mehrkosten?.toString()).toBe("0");
    expect(lang.bindungMonate?.toString()).toBe("48");
    // Bindung endet am 31.05.2027: Monate ab 28.06.2027 bis 28.10.2027 sind offen (5 von 12)
    const bald = kreditRisiko(kredit("b", { sollzins: dezimal("1.5"), zinsbindungBis: "2027-05-31", saldo: "1200000" }), [], heute, 100)!;
    expect(bald.mehrkosten?.toString()).toBe("5000");
    const ab = kreditRisiko(kredit("c", { sollzins: dezimal("1.5"), zinsbindungBis: "2026-06-30", saldo: "100000" }), [], heute, 100)!;
    expect(ab.kategorie).toBe("festAbgelaufen");
    expect(ab.anteile?.variabel.toString()).toBe("100000");
    expect(ab.mehrkosten?.toString()).toBe("1000");
  });

  it("variabel: Swap-Anteil steigt nicht, ungesicherter Teil voll", () => {
    const r = kreditRisiko(
      kredit("v", { zinsArt: "VARIABEL", referenzzins: "EURIBOR3M", marge: dezimal("1"), saldo: "1000000", sicherungen: [swap("600000", "2031-12-31")] }),
      ref,
      heute,
      100,
    )!;
    expect(r.anteile?.abgesichert.toString()).toBe("600000");
    expect(r.anteile?.variabel.toString()).toBe("400000");
    // 0,6 × (2,5 + 1) + 0,4 × (2 + 1)
    expect(r.satz?.toString()).toBe("3.3");
    expect(r.mehrkosten?.toString()).toBe("4000");
    expect(r.bindungMonate?.toString()).toBe("36.6");
  });

  it("variabel ohne Referenzzins: Mehrkosten und Satz unbekannt, Anteile bekannt", () => {
    const r = kreditRisiko(kredit("v", { zinsArt: "VARIABEL", referenzzins: "EURIBOR6M", marge: dezimal("1"), saldo: "500000" }), ref, heute, 100)!;
    expect(r.luecken).toEqual(["referenzzins"]);
    expect(r.satz).toBeNull();
    expect(r.mehrkosten).toBeNull();
    expect(r.anteile?.variabel.toString()).toBe("500000");
  });

  it("gewichtet mit der Restschuld und zählt Lücken", () => {
    const risiken = [
      kreditRisiko(kredit("a", { sollzins: dezimal("1"), zinsbindungBis: "2031-11-30", saldo: "300000" }), [], heute, 100)!,
      kreditRisiko(kredit("b", { sollzins: dezimal("3"), zinsbindungBis: "2028-11-30", saldo: "100000" }), [], heute, 100)!,
      kreditRisiko(kredit("c", { sollzins: dezimal("2"), zinsbindungBis: "2030-01-31" }), [], heute, 100)!,
    ];
    expect(kreditRisiko(kredit("x", { saldo: "0" }), [], heute, 100)).toBeNull();
    const g = gruppenRisiko(risiken);
    expect(g.anzahl).toBe(3);
    expect(g.ohneBeleg).toBe(1);
    expect(g.restschuld.toString()).toBe("400000");
    expect(g.durchschnittszins.wert?.toString()).toBe("1.5");
    // (60 × 3 + 24 × 1) / 4 = 51 Monate = 4,25 Jahre
    expect(g.bindungJahre.wert?.toString()).toBe("4.25");
    expect(g.anteileProzent?.fest.toString()).toBe("100");
    expect(g.mehrkostenFehlend).toBe(0);
  });
});
