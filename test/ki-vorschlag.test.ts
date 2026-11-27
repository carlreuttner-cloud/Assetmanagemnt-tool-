import { describe, expect, it } from "vitest";
import { texte } from "@/i18n";
import { formatierer } from "@/lib/format";
import { dezimal } from "@/lib/geld";
import type { KreditDaten } from "@/lib/kredit";
import {
  baueVorschlagPaket,
  demoVorschlag,
  jaehrlicheVeraenderung,
  normalisiere,
  PARAMETER,
  pruefeVorschlag,
  szenarioJahre,
  verkaufskosten,
  vorschlagPaketAlsText,
  type VorschlagEingabe,
} from "@/lib/ki-vorschlag";

const t = texte();
const f = formatierer();
const HEUTE = "2026-11-27";

function kredit(teil: Partial<KreditDaten> = {}): KreditDaten {
  return {
    id: "K1",
    gesellschaftId: "G1",
    bezeichnung: "Darlehen A",
    zinsArt: "FEST",
    sollzins: dezimal(3),
    referenzzins: null,
    marge: null,
    ursprungsbetrag: dezimal(600000),
    auszahlungsdatum: "2020-01-01",
    zinsbindungBis: "2029-06-30",
    laufzeitBis: null,
    zahlweise: "MONATLICH",
    tilgungsart: "ANNUITAET",
    anfaenglicheTilgung: null,
    ratenbetrag: dezimal(2500),
    haeuser: [{ hausId: "H1", anteilProzent: dezimal(100) }],
    buchungen: [],
    salden: [{ stichtag: "2026-10-31", art: "DARLEHEN", betrag: dezimal(500000), quelle: "KONTOAUSZUG", status: "BELEGT" }],
    tilgungsplaene: [],
    ...teil,
  };
}

const vertrag = (beginn: string, ende: string | null, soll: number) => ({ beginn, ende, sollMiete: dezimal(soll), istMiete: dezimal(soll), letzteMieterhoehung: null });

function eingabe(teil: Partial<VorschlagEingabe> = {}): VorschlagEingabe {
  const einheiten: VorschlagEingabe["einheiten"] = [
    { id: "E1", bezeichnung: "WE 1", art: "WOHNUNG", flaeche: dezimal(100), erwarteteMiete: null, vertraege: [vertrag("2019-03-01", "2022-12-31", 800), vertrag("2023-03-01", null, 1000)] },
    { id: "E2", bezeichnung: "WE 2", art: "WOHNUNG", flaeche: dezimal(50), erwarteteMiete: dezimal(600), vertraege: [vertrag("2018-01-01", "2026-06-30", 450)] },
  ];
  return {
    stichtag: HEUTE,
    haus: { id: "H1", name: "Testhaus", gesellschaftId: "G1", gesellschaft: "Test GmbH", kaufpreis: dezimal(900000), kaufdatum: "2018-01-01" },
    daten: {
      id: "H1",
      gesellschaftId: "G1",
      kaufpreis: dezimal(900000),
      verkehrswerte: [],
      einheiten: einheiten.map((u) => ({ id: u.id, art: u.art, flaeche: u.flaeche, erwarteteMiete: u.erwarteteMiete, mietverhaeltnisse: u.vertraege.map((m) => ({ beginn: m.beginn, ende: m.ende, istMiete: m.istMiete, sollMiete: m.sollMiete, rueckstand: dezimal(0) })) })),
    },
    einheiten,
    werte: [
      { stichtag: "2020-12-31", wert: dezimal(1000000), quelle: null, gutachten: { gutachter: "Sachverständiger", rohertragJahr: dezimal(50000) } },
      { stichtag: "2025-12-31", wert: dezimal(1200000), quelle: null, gutachten: { gutachter: "Sachverständiger", rohertragJahr: dezimal(60000) } },
    ],
    kredite: [{ daten: kredit(), name: "Darlehen A" }],
    referenzwerte: [],
    investitionen: [{ datum: "2024-05-01", betrag: dezimal(30000) }],
    exitrechnungen: [],
    ...teil,
  };
}

describe("Datenpaket für KI-Vorschläge", () => {
  const paket = baueVorschlagPaket(eingabe(), t, f);
  const namen = paket.fakten.map((x) => x.name);

  it("enthält Neuvermietungen je Jahr, Trend und Leerstandszeiten", () => {
    expect(namen).toContain("Ø Soll-Miete je m² der Neuvermietungen 2019");
    expect(namen).toContain("Ø Soll-Miete je m² der Neuvermietungen 2023");
    expect(namen.some((n) => n.startsWith("Jährliche Veränderung der Neuvermietungsmiete"))).toBe(true);
    // WE 1: Ende 31.12.2022, neuer Vertrag 01.03.2023 → 3 Monate; ein Wechsel
    const wechsel = paket.fakten.find((x) => x.name === "Leerstandszeit zwischen zwei Mietverträgen")!;
    expect(wechsel.wert).toContain("1 Mieterwechsel");
    expect(paket.demo.leerVermietenMonate?.wert).toBe("3");
  });

  it("leitet Wertentwicklung, Rohertragsfaktor und Verkaufszeitpunkt aus Fakten ab", () => {
    // (1,2 Mio ÷ 1,0 Mio)^(1/5) − 1 ≈ 3,7 %
    expect(paket.demo.wertentwicklung?.wert).toBe("3.7");
    expect(namen).toContain("Rohertragsfaktor des jüngsten Gutachtens");
    expect(paket.demo.preisBasis?.wert).toBe("gutachten");
    expect(paket.demo.verkaufsdatum?.wert).toBe("2029-06-30");
  });

  it("nennt Lücken statt Werte zu schätzen", () => {
    const texteL = paket.luecken.map((l) => l.text);
    expect(texteL.some((x) => x.includes("Vorfälligkeitsentschädigung"))).toBe(true);
    expect(texteL.some((x) => x.includes("Keine gespeicherte Exit-Rechnung"))).toBe(true);
    expect(paket.demo.maklerProzent).toBeUndefined();
  });

  it("nimmt Restschulden nur aus belegten Salden, nie aus Buchungen", () => {
    const k = kredit({ salden: [], buchungen: [{ datum: "2026-09-30", art: "TILGUNG", betrag: dezimal(1000), saldoNach: dezimal(480000) }] });
    const p = baueVorschlagPaket(eingabe({ kredite: [{ daten: k, name: "Darlehen A" }] }), t, f);
    expect(p.fakten.some((x) => x.name.startsWith("Restschuld"))).toBe(false);
    expect(p.luecken.some((l) => l.text.includes("Kein belegter Saldo"))).toBe(true);
    expect(paket.fakten.find((x) => x.name.startsWith("Restschuld"))?.wert).toContain("500.000,00");
  });

  it("übernimmt gespeicherte Exit-Rechnungen als eigene Annahmen", () => {
    const p = baueVorschlagPaket(
      eingabe({ exitrechnungen: [{ name: "Basis", geaendertAm: "2026-10-01", maklerProzent: dezimal(3), sonstigeProzent: dezimal("1.5"), vfeProzent: null, faktor: null, preisBasis: "gutachten" }] }),
      t,
      f,
    );
    expect(p.demo.maklerProzent?.wert).toBe("3");
    expect(p.demo.sonstigeProzent?.wert).toBe("1.5");
  });

  it("Text für die KI enthält Fakten, Lücken und den Auftrag", () => {
    const text = vorschlagPaketAlsText(paket, t);
    expect(text).toContain("[F1]");
    expect(text).toContain("[L1]");
    expect(text).toContain("2036-11-27");
  });
});

describe("Prüfung der KI-Antwort", () => {
  const paket = baueVorschlagPaket(eingabe(), t, f);
  const antwort = (werte: Array<{ parameter: string; wert: string; quellen: string[] }>) => ({
    zusammenfassung: "Test",
    werte: werte.map((w) => ({ begruendung: "weil", ...w })),
    datenluecken: [{ text: "fehlt", quellen: ["L1", "L99"] }],
  });

  it("übernimmt nur belegte Werte im erlaubten Bereich", () => {
    const e = pruefeVorschlag(
      antwort([
        { parameter: "mietsteigerung", wert: "2,0 %", quellen: ["F3"] },
        { parameter: "wertentwicklung", wert: "2.5", quellen: ["L1"] },
        { parameter: "anschlusszins", wert: "25", quellen: ["F3"] },
        { parameter: "verkaufsdatum", wert: "2025-12-31", quellen: ["F3"] },
        { parameter: "preisBasis", wert: "frei", quellen: ["F3"] },
        { parameter: "maklerProzent", wert: "", quellen: ["L1"] },
        { parameter: "leerVermietenMonate", wert: "3.5", quellen: ["F3"] },
        { parameter: "faktor", wert: "20", quellen: ["F999", "f3"] },
      ]),
      paket,
    );
    const status = Object.fromEntries(e.werte.map((w) => [w.parameter, w.status]));
    expect(status).toMatchObject({
      mietsteigerung: "ok",
      wertentwicklung: "ohneBeleg",
      anschlusszins: "ungueltig",
      verkaufsdatum: "ungueltig",
      preisBasis: "ungueltig",
      maklerProzent: "unbekannt",
      leerVermietenMonate: "ungueltig",
      faktor: "ok",
      vfeProzent: "fehlt",
    });
    expect(e.werte.find((w) => w.parameter === "mietsteigerung")?.wert).toBe("2");
    expect(e.werte.find((w) => w.parameter === "faktor")?.quellen).toEqual(["F3"]);
    expect(e.werte.every((w) => w.status === "ok" || w.wert === null)).toBe(true);
    expect(e.werte).toHaveLength(PARAMETER.length);
    expect(e.pruefung).toEqual({ uebernommen: 2, nichtUebernommen: 5, unbekannteVerweise: 2 });
  });

  it("verwirft Antworten im falschen Format", () => {
    expect(() => pruefeVorschlag({ werte: [] }, paket)).toThrow();
    expect(() => pruefeVorschlag(antwort([{ parameter: "unbekannt", wert: "1", quellen: [] }]), paket)).toThrow();
  });

  it("Beispielvorschlag zeigt übernommene Werte und einen verworfenen", () => {
    const e = demoVorschlag(paket, t);
    const status = Object.fromEntries(e.werte.map((w) => [w.parameter, w.status]));
    expect(status.wertentwicklung).toBe("ok");
    expect(status.verkaufsdatum).toBe("ok");
    expect(status.zinsVariabelPP).toBe("ohneBeleg");
    expect(status.maklerProzent).toBe("unbekannt");
  });
});

describe("Hilfsfunktionen", () => {
  it("normalisiert Werte", () => {
    expect(normalisiere("verkaufsdatum", "2028-12-31", HEUTE)).toBe("2028-12-31");
    expect(normalisiere("verkaufsdatum", "2037-01-01", HEUTE)).toBeNull();
    expect(normalisiere("preisBasis", "Miete", HEUTE)).toBe("miete");
    expect(normalisiere("zinsVariabelPP", "-0,5", HEUTE)).toBe("-0.5");
  });

  it("jährliche Veränderung erst ab einem Jahr Abstand", () => {
    expect(jaehrlicheVeraenderung({ stichtag: "2026-01-01", wert: dezimal(100) }, { stichtag: "2026-06-30", wert: dezimal(110) })).toBeNull();
    expect(jaehrlicheVeraenderung({ stichtag: "2024-01-01", wert: dezimal(100) }, { stichtag: "2026-01-01", wert: dezimal(121) })!.toDecimalPlaces(1).toString()).toBe("10");
  });

  it("Verkaufskosten und Szenario-Jahre", () => {
    expect(verkaufskosten({ maklerProzent: "3", sonstigeProzent: "1.5" })!.toString()).toBe("4.5");
    expect(verkaufskosten({ maklerProzent: "3", sonstigeProzent: null })).toBeNull();
    expect(szenarioJahre(HEUTE, "2029-06-30")).toBe(3);
    expect(szenarioJahre(HEUTE, "2026-12-31")).toBe(1);
    expect(szenarioJahre(HEUTE, null)).toBe(5);
  });
});
