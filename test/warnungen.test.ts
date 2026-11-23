import { describe, expect, it } from "vitest";
import { dezimal } from "@/lib/geld";
import { zeitreihe, zinsbindungsProfil } from "@/lib/kennzahlen";
import { restschuld } from "@/lib/kredit";
import { ermittleWarnungen, type CovenantDaten } from "@/lib/warnungen";
import { erzeugePortfolio, kennzahlen, STICHTAG } from "../prisma/testdaten/portfolio";
import { alsDaten } from "./hilfen/testportfolio";

const p = erzeugePortfolio();
const { haeuser, kredite } = alsDaten(p);
const covenants: CovenantDaten[] = p.kredite.flatMap((k) =>
  (k.covenants ?? []).map((c) => ({ kreditId: k.schluessel, kennzahl: c.kennzahl, vergleich: c.vergleich, schwellenwert: dezimal(c.schwellenwert) })),
);
const warnungen = ermittleWarnungen(haeuser, kredite, covenants, [], STICHTAG);

describe("Warnungen der Übersicht", () => {
  it("meldet die Covenant-Verletzung von K12 als dringend", () => {
    const w = warnungen.find((x) => x.art === "covenant" && x.kreditId === "K12");
    expect(w?.stufe).toBe("hoch");
  });

  it("meldet das Zinsbindungsende von K09 als dringend und keine variablen Kredite", () => {
    const zb = warnungen.filter((x) => x.art === "zinsbindung");
    expect(zb.find((x) => x.kreditId === "K09")?.stufe).toBe("hoch");
    const variabel = new Set(p.kredite.filter((k) => k.zinsArt === "VARIABEL").map((k) => k.schluessel));
    expect(zb.some((x) => variabel.has(x.kreditId))).toBe(false);
  });

  it("meldet Rückstände in jedem Haus und Leerstand genau in den Häusern mit Leerstand", () => {
    expect(warnungen.filter((x) => x.art === "rueckstand")).toHaveLength(15);
    const mitLeerstand = kennzahlen(p).filter((k) => !k.leerstandProzent.isZero()).map((k) => k.haus).sort();
    expect(warnungen.filter((x) => x.art === "leerstand").map((x) => (x.art === "leerstand" ? x.hausId : "")).sort()).toEqual(mitLeerstand);
  });

  it("sortiert dringende Warnungen nach vorn", () => {
    const erste = warnungen.findIndex((x) => x.stufe === "mittel");
    expect(warnungen.slice(erste).every((x) => x.stufe === "mittel")).toBe(true);
  });
});

describe("Verläufe", () => {
  it("Zeitreihe am Stichtag entspricht den Summen", () => {
    const [punkt] = zeitreihe(haeuser, kredite, [STICHTAG]);
    expect(punkt.restschuld.toFixed(2)).toBe(kredite.reduce((s, k) => s.plus(restschuld(k, STICHTAG)), dezimal(0)).toFixed(2));
    const soll = kennzahlen(p).reduce((s, k) => s.plus(k.sollMonat), dezimal(0));
    expect(punkt.sollMonat.toFixed(2)).toBe(soll.toFixed(2));
  });

  it("Zinsbindungsprofil verteilt die gesamte Restschuld", () => {
    const profil = zinsbindungsProfil(kredite, STICHTAG);
    const summe = profil.reduce((s, g) => s.plus(g.restschuld), dezimal(0));
    expect(summe.toFixed(2)).toBe(kredite.reduce((s, k) => s.plus(restschuld(k, STICHTAG)), dezimal(0)).toFixed(2));
    expect(profil[0].jahr).toBe("variabel");
    expect(profil.find((g) => g.jahr === "variabel")?.anzahl).toBe(7);
  });
});
