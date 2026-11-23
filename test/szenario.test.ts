import { describe, expect, it } from "vitest";
import { dezimal } from "@/lib/geld";
import { monatsende, monatsNummer } from "@/lib/datum";
import type { ReferenzWert } from "@/lib/kredit";
import { alsJson, ausJson, basisParameter, rechneSzenario } from "@/lib/szenario";
import { euribor } from "../prisma/testdaten/hilfen";
import { erzeugePortfolio, STICHTAG } from "../prisma/testdaten/portfolio";
import { alsDaten } from "./hilfen/testportfolio";

const p = erzeugePortfolio();
const { haeuser, kredite } = alsDaten(p);
const referenzwerte: ReferenzWert[] = (["3M-EURIBOR", "6M-EURIBOR"] as const).flatMap((r) =>
  Array.from({ length: 12 }, (_, i) => {
    const m = monatsNummer("2026-01-01") + i;
    return { referenz: r, stichtag: monatsende(m), satz: euribor(r, m) };
  }),
);
const rechne = (aenderung: Partial<ReturnType<typeof basisParameter>> = {}) =>
  rechneSzenario(haeuser, kredite, referenzwerte, STICHTAG, { ...basisParameter(5), ...aenderung });
const basis = rechne();

describe("Szenarien", () => {
  it("rechnet 5 Kalenderjahre ab dem nächsten Jahr", () => {
    expect(basis.jahre.map((j) => j.jahr)).toEqual([2027, 2028, 2029, 2030, 2031]);
  });

  it("Basis: Miete bleibt auf heutigem Stand, Restschuld sinkt jedes Jahr", () => {
    for (const j of basis.jahre) expect(j.sollMiete.toFixed(2)).toBe(basis.heute.sollMieteJahr.toFixed(2));
    let vorher = basis.heute.restschuld;
    for (const j of basis.jahre) {
      expect(j.restschuld.lessThan(vorher)).toBe(true);
      vorher = j.restschuld;
    }
    // Kapitaldienst im ersten Jahr liegt nahe am Kapitaldienst der letzten 12 Monate laut Buchungen
    const letzte12 = kredite
      .flatMap((k) => k.buchungen)
      .filter((b) => b.datum > "2025-10-31" && b.datum <= STICHTAG && (b.art === "ZINS" || b.art === "TILGUNG"))
      .reduce((s, b) => s.plus(b.betrag), dezimal(0));
    const abweichung = basis.jahre[0].kapitaldienst.minus(letzte12).abs().dividedBy(letzte12);
    expect(abweichung.lessThan("0.05"), abweichung.toFixed(4)).toBe(true);
  });

  it("Mietsteigerung wirkt ab dem 1. Januar und jährlich", () => {
    const s = rechne({ mietsteigerung: dezimal(2) });
    expect(s.jahre[0].sollMiete.toFixed(0)).toBe(basis.jahre[0].sollMiete.times("1.02").toFixed(0));
    expect(s.jahre[1].sollMiete.toFixed(0)).toBe(basis.jahre[1].sollMiete.times("1.0404").toFixed(0));
  });

  it("Zinsanstieg verteuert variable Kredite um etwa 1 % der Restschuld, Tilgung bleibt", () => {
    const s = rechne({ zinsVariabelPP: dezimal(1) });
    const variabel = kredite.filter((k) => k.zinsArt === "VARIABEL");
    const saldo = rechneSzenario(haeuser, variabel, referenzwerte, STICHTAG, basisParameter(1)).heute.restschuld;
    const mehr = s.jahre[0].zinsen.minus(basis.jahre[0].zinsen);
    expect(mehr.dividedBy(saldo).minus("0.01").abs().lessThan("0.001"), mehr.toFixed(2)).toBe(true);
    expect(s.jahre[0].tilgung.minus(basis.jahre[0].tilgung).abs().lessThan(1000)).toBe(true);
  });

  it("Anschlusszins wirkt erst nach dem Ende der Zinsbindung", () => {
    const s = rechne({ anschlusszins: dezimal(5) });
    const k09 = kredite.find((k) => k.id === "K09")!; // Zinsbindung bis 30.11.2026
    const nur = (k: typeof kredite) => rechneSzenario(haeuser, k, referenzwerte, STICHTAG, { ...basisParameter(5), anschlusszins: dezimal(5) });
    const ohne = rechneSzenario(haeuser, [k09], referenzwerte, STICHTAG, basisParameter(5));
    expect(nur([k09]).jahre[0].zinsen.greaterThan(ohne.jahre[0].zinsen)).toBe(true);
    const spaet = kredite.filter((k) => k.zinsArt === "FEST" && k.zinsbindungBis! > "2032-01-01");
    expect(nur(spaet).summe.zinsen.toFixed(2)).toBe(rechneSzenario(haeuser, spaet, referenzwerte, STICHTAG, basisParameter(5)).summe.zinsen.toFixed(2));
    expect(s.summe.zinsen.greaterThan(basis.summe.zinsen)).toBe(true);
  });

  it("Leerstand vermieten erhöht die Miete um die erwartete Miete", () => {
    const s = rechne({ leerVermietenMonate: 0 });
    const erwartet = haeuser.flatMap((h) => h.einheiten).filter((e) => !e.mietverhaeltnisse.some((m) => m.beginn <= STICHTAG && (!m.ende || m.ende >= STICHTAG)));
    const mehr = erwartet.reduce((x, e) => x.plus(e.erwarteteMiete ?? 0), dezimal(0)).times(12);
    expect(s.jahre[0].sollMiete.minus(basis.jahre[0].sollMiete).toFixed(0)).toBe(mehr.toFixed(0));
  });

  it("Verkauf: Haus fällt weg, Kreditanteil wird abgelöst, Nettoerlös im Verkaufsjahr", () => {
    const h = haeuser[0];
    const s = rechne({ verkaeufe: [{ hausId: h.id, datum: "2027-07-01", preis: dezimal(20_000_000) }], verkaufskosten: dezimal(2) });
    expect(s.jahre[0].haeuser).toBe(14);
    expect(s.jahre[0].verkaufNetto.greaterThan(0)).toBe(true);
    expect(s.jahre[0].restschuld.lessThan(basis.jahre[0].restschuld)).toBe(true);
    // Ablöse + Netto + Kosten ≈ Preis (Differenz: Tilgung auf den abgelösten Anteil nach dem Verkauf)
    const abloese = basis.jahre[0].restschuld.minus(s.jahre[0].restschuld);
    const summe = s.jahre[0].verkaufNetto.plus(400_000).plus(abloese);
    expect(summe.minus(20_000_000).abs().lessThan(200_000), summe.toFixed(2)).toBe(true);
    expect(s.jahre[1].sollMiete.lessThan(basis.jahre[1].sollMiete)).toBe(true);
  });

  it("Parameter lassen sich als JSON speichern und wieder lesen", () => {
    const pa = { ...basisParameter(7), mietsteigerung: dezimal("1.5"), anschlusszins: dezimal("4.25"), verkaeufe: [{ hausId: "x", datum: "2028-01-01", preis: null }] };
    expect(alsJson(ausJson(JSON.parse(JSON.stringify(alsJson(pa)))))).toEqual(alsJson(pa));
    expect(ausJson({ jahre: 99 }).jahre).toBe(10);
  });
});
