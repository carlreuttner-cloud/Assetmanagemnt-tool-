import { describe, expect, it } from "vitest";
import { dezimal } from "@/lib/geld";
import type { KreditDaten } from "@/lib/kredit";
import { maturityWall, phase, refinanzierungsEreignis, refinanzierungsFaelle, vorbereitungAb } from "@/lib/refinanzierung";

const kredit = (id: string, o: { zinsArt?: "FEST" | "VARIABEL"; zinsbindungBis?: string | null; laufzeitBis?: string | null; saldo?: string | null }): KreditDaten =>
  ({
    id,
    gesellschaftId: "g1",
    auszahlungsdatum: "2020-01-01",
    zinsArt: o.zinsArt ?? "FEST",
    zinsbindungBis: o.zinsbindungBis ?? null,
    laufzeitBis: o.laufzeitBis ?? null,
    haeuser: [],
    buchungen: [],
    salden: o.saldo != null ? [{ art: "DARLEHEN", status: "BELEGT", stichtag: "2026-06-30", betrag: dezimal(o.saldo), quelle: "KONTOAUSZUG" }] : [],
  }) as unknown as KreditDaten;

const heute = "2026-11-28";

describe("Refinanzierung", () => {
  it("nimmt das frühere Ereignis; Zinsbindung nur bei Festzins", () => {
    expect(refinanzierungsEreignis(kredit("a", { zinsbindungBis: "2028-01-31", laufzeitBis: "2035-12-31" }))).toEqual({ art: "zinsbindung", datum: "2028-01-31" });
    expect(refinanzierungsEreignis(kredit("b", { zinsArt: "VARIABEL", zinsbindungBis: "2027-01-31", laufzeitBis: "2030-12-31" }))).toEqual({ art: "kreditende", datum: "2030-12-31" });
    expect(refinanzierungsEreignis(kredit("c", { zinsArt: "VARIABEL" }))).toBeNull();
  });

  it("ordnet Phasen nach 18 und 24 Monaten Vorlauf", () => {
    expect(phase({ art: "zinsbindung", datum: "2026-10-31" }, heute)).toBe("ueberfaellig");
    expect(phase({ art: "zinsbindung", datum: "2028-03-31" }, heute)).toBe("dringend");
    expect(phase({ art: "zinsbindung", datum: "2028-09-30" }, heute)).toBe("vorbereiten");
    expect(phase({ art: "zinsbindung", datum: "2029-06-30" }, heute)).toBe("spaeter");
    expect(vorbereitungAb({ art: "zinsbindung", datum: "2028-09-30" })).toBe("2026-09-30");
  });

  it("listet nur Fälle im Vorlauf und lässt getilgte Kredite weg", () => {
    const faelle = refinanzierungsFaelle(
      [
        kredit("spaet", { zinsbindungBis: "2031-01-31", saldo: "100" }),
        kredit("bald", { zinsbindungBis: "2027-06-30", saldo: "500000" }),
        kredit("getilgt", { zinsbindungBis: "2027-03-31", saldo: "0" }),
        kredit("ohneBeleg", { zinsbindungBis: "2028-06-30" }),
      ],
      heute,
    );
    expect(faelle.map((f) => f.kreditId)).toEqual(["bald", "ohneBeleg"]);
    expect(faelle[0].nachweis?.betrag.toString()).toBe("500000");
    expect(faelle[1].nachweis).toBeNull();
  });

  it("summiert je Jahr nur belegte Salden und zählt Kredite ohne Beleg", () => {
    const wand = maturityWall(
      [
        kredit("a", { zinsbindungBis: "2027-06-30", saldo: "300000" }),
        kredit("b", { laufzeitBis: "2027-12-31", saldo: "200000" }),
        kredit("c", { zinsbindungBis: "2027-09-30" }),
        kredit("d", { zinsbindungBis: "2040-01-31", saldo: "1" }),
        kredit("e", { zinsArt: "VARIABEL", saldo: "50" }),
        kredit("f", { zinsbindungBis: "2025-12-31", saldo: "10" }),
      ],
      heute,
      5,
    );
    const j = (s: string) => wand.find((w) => w.jahr === s)!;
    expect(wand.map((w) => w.jahr)).toEqual(["ueberfaellig", "2026", "2027", "2028", "2029", "2030", "spaeter", "offen"]);
    expect(j("2027").restschuld.toString()).toBe("500000");
    expect(j("2027").anzahl).toBe(3);
    expect(j("2027").ohneBeleg).toBe(1);
    expect(j("2027").zinsbindung).toBe(2);
    expect(j("2027").kreditende).toBe(1);
    expect(j("spaeter").anzahl).toBe(1);
    expect(j("offen").restschuld.toString()).toBe("50");
    expect(j("ueberfaellig").anzahl).toBe(1);
  });
});
