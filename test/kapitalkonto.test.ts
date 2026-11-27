import { describe, expect, it } from "vitest";
import { dezimal } from "@/lib/geld";
import { anteilEinlagen, anteilWeichtAb, kontosummen, kontoverlauf, type Bewegung } from "@/lib/kapitalkonto";

const b = (art: Bewegung["art"], datum: string | null, betrag: number): Bewegung => ({ art, datum, betrag: dezimal(betrag) });
const liste = [b("EINLAGE", "2020-03-01", 1000), b("EINLAGE", null, 500), b("AUSSCHUETTUNG", "2022-06-30", 20), b("RUECKZAHLUNG", "2023-12-15", 100)];

describe("Kapitalkonto", () => {
  it("summiert je Art, Saldo = Einlagen − Rückzahlungen − Ausschüttungen", () => {
    const s = kontosummen(liste);
    expect(s.einlagen.toString()).toBe("1500");
    expect(s.nettoEinlagen.toString()).toBe("1400");
    expect(s.saldo.toString()).toBe("1380");
    expect(s.ohneDatum).toBe(1);
  });

  it("bis zu einem Stichtag nur datierte Bewegungen", () => {
    expect(kontosummen(liste, "2022-12-31").saldo.toString()).toBe("980");
  });

  it("Jahresverlauf mit getrennten Bewegungen ohne Datum", () => {
    const v = kontoverlauf(liste, 2024);
    expect(v.jahre.map((j) => j.jahr)).toEqual([2020, 2021, 2022, 2023, 2024]);
    expect(v.jahre[0].saldoEnde.toString()).toBe("1000");
    expect(v.jahre[3].rueckzahlungen.toString()).toBe("100");
    expect(v.jahre[4].saldoEnde.toString()).toBe("880");
    expect(v.ohneDatum?.einlagen.toString()).toBe("500");
    expect(kontoverlauf([], 2024)).toEqual({ jahre: [], ohneDatum: null });
  });

  it("Anteil an den Einlagen und Abweichung zur Beteiligung", () => {
    expect(anteilEinlagen(dezimal(900), dezimal(1000))?.toString()).toBe("90");
    expect(anteilEinlagen(dezimal(0), dezimal(0))).toBeNull();
    expect(anteilWeichtAb(dezimal(90), dezimal("89.8"))).toBe(false);
    expect(anteilWeichtAb(dezimal(70), dezimal(100))).toBe(true);
    expect(anteilWeichtAb(null, dezimal(100))).toBeNull();
  });
});
