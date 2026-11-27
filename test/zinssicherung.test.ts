import { describe, expect, it } from "vitest";
import { dezimal } from "@/lib/geld";
import { gesicherterSatz, zinssatz, type KreditDaten, type ZinssicherungDaten } from "@/lib/kredit";
import { rechneLiquiditaet } from "@/lib/liquiditaet";
import { basisParameter, rechneSzenario } from "@/lib/szenario";
import { sammleFristen } from "@/lib/fristen";
import { texte } from "@/i18n";

const HEUTE = "2026-11-27";
const ref = (satz: string) => [{ referenz: "3M-EURIBOR", stichtag: "2026-10-31", satz: dezimal(satz) }];
const cap = (teil: Partial<ZinssicherungDaten> = {}): ZinssicherungDaten => ({ id: "C1", art: "CAP", satz: dezimal(2), nominal: null, beginn: "2024-01-01", ende: "2028-12-31", ...teil });

function kredit(sicherungen: ZinssicherungDaten[] = []): KreditDaten {
  return {
    id: "K1",
    gesellschaftId: "G1",
    bezeichnung: "Variabel",
    zinsArt: "VARIABEL",
    sollzins: null,
    referenzzins: "3M-EURIBOR",
    marge: dezimal("1.5"),
    ursprungsbetrag: dezimal(200000),
    auszahlungsdatum: "2022-01-01",
    zinsbindungBis: null,
    laufzeitBis: null,
    zahlweise: "MONATLICH",
    tilgungsart: "RATENTILGUNG",
    anfaenglicheTilgung: null,
    ratenbetrag: dezimal(500),
    haeuser: [{ hausId: "H1", anteilProzent: dezimal(100) }],
    buchungen: [],
    salden: [{ stichtag: "2026-10-31", art: "DARLEHEN", betrag: dezimal(100000), quelle: "KONTOAUSZUG", status: "BELEGT" }],
    tilgungsplaene: [],
    sicherungen,
  };
}

describe("Zinssicherungen", () => {
  it("Cap begrenzt den Referenzzins, solange er läuft", () => {
    expect(zinssatz(kredit(), ref("2.5"), HEUTE)!.toFixed(3)).toBe("4.000");
    expect(zinssatz(kredit([cap()]), ref("2.5"), HEUTE)!.toFixed(3)).toBe("3.500");
    // Referenz unter dem Cap: keine Wirkung
    expect(zinssatz(kredit([cap()]), ref("1.2"), HEUTE)!.toFixed(3)).toBe("2.700");
    // abgelaufen oder noch nicht begonnen: keine Wirkung
    expect(zinssatz(kredit([cap({ ende: "2026-06-30" })]), ref("2.5"), HEUTE)!.toFixed(3)).toBe("4.000");
    expect(zinssatz(kredit([cap({ beginn: "2027-01-01" })]), ref("2.5"), HEUTE)!.toFixed(3)).toBe("4.000");
  });

  it("Swap mit Teil-Nominal gewichtet nach Anteil an der belegten Restschuld", () => {
    const swap = cap({ art: "SWAP", satz: dezimal("2.2"), nominal: dezimal(60000) });
    // 60 % zu 2,2 + 1,5 = 3,7; 40 % zu 2,5 + 1,5 = 4,0 → 3,82
    expect(zinssatz(kredit([swap]), ref("2.5"), HEUTE)!.toFixed(3)).toBe("3.820");
    const g = gesicherterSatz(kredit([swap]), dezimal("2.5"), HEUTE, dezimal(100000))!;
    expect(g.teile.map((x) => x.anteil.toFixed(2))).toEqual(["0.60", "0.40"]);
    // negativer Referenzzins: Kredit-Floor 0 %, Swap zahlt fest und erhält den negativen Satz
    expect(gesicherterSatz(kredit([cap({ art: "SWAP", satz: dezimal(1) })]), dezimal("-0.5"), HEUTE, null)!.satz.toFixed(3)).toBe("3.000");
  });

  it("Nominal ohne bekannte Restschuld: Zinssatz unbekannt", () => {
    const k = { ...kredit([cap({ nominal: dezimal(50000) })]), salden: [] };
    expect(zinssatz(k, ref("2.5"), HEUTE)).toBeNull();
  });

  it("Szenario: Zinsanstieg wirkt beim Cap nur bis zur Obergrenze, nach dem Ende voll", () => {
    const haus = { id: "H1", gesellschaftId: "G1", kaufpreis: null, verkehrswerte: [{ stichtag: "2026-01-01", wert: dezimal(400000) }], einheiten: [] };
    const p = { ...basisParameter(3), zinsVariabelPP: dezimal(2) };
    const ohne = rechneSzenario([haus], [kredit()], ref("2.5"), HEUTE, p);
    const mit = rechneSzenario([haus], [kredit([cap({ ende: "2027-12-31" })])], ref("2.5"), HEUTE, p);
    // 2027: Cap aktiv (2 % statt 4,5 %), 2028: abgelaufen → wie ohne Sicherung
    expect(mit.jahre[0].zinsen.lessThan(ohne.jahre[0].zinsen.times("0.7"))).toBe(true);
    const z28 = mit.jahre[1].zinsen.dividedBy(ohne.jahre[1].zinsen);
    expect(z28.minus(1).abs().lessThan("0.02"), z28.toFixed(4)).toBe(true);
  });

  it("Liquidität: Cap-Ende im Planzeitraum erhöht die Zinsen und wird als Hinweis geführt", () => {
    const k = kredit([cap({ ende: "2027-03-31" })]);
    const plan = rechneLiquiditaet({ haeuser: [], kredite: [k], referenzwerte: ref("2.5"), massnahmen: [], positionen: [], kontostaende: [], mindestliquiditaet: null, heute: HEUTE });
    // Dezember: 3,5 % auf 100.000 / 12 = 291,67; April: 4,0 % auf die niedrigere Restschuld
    expect(plan.monate[0].zins.toFixed(2)).toBe("291.67");
    expect(plan.monate[4].zins.greaterThan(325)).toBe(true);
    expect(plan.hinweise.sicherungEndet).toEqual(["K1"]);
  });

  it("Fristen: Ende einer laufenden Sicherung erscheint, abgelaufene nicht", () => {
    const { fristen } = sammleFristen(
      {
        kredite: [
          {
            id: "K1", bezeichnung: "Variabel", gesellschaftId: "G1", gesellschaft: "G", zinsArt: "VARIABEL", zinsbindungBis: null, laufzeitBis: null,
            sicherungen: [{ art: "Cap", satz: "2,00 %", ende: "2027-03-31" }, { art: "Swap", satz: "0,80 %", ende: "2025-12-31" }],
          },
        ],
        mietverhaeltnisse: [],
      },
      HEUTE,
      "2027-11-27",
      texte().fristen,
      (d) => d,
    );
    expect(fristen.map((f) => [f.art, f.datum])).toEqual([["sicherungsende", "2027-03-31"]]);
    expect(fristen[0].grundlage).toContain("Cap 2,00 %");
  });
});
