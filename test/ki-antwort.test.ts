import { describe, expect, it } from "vitest";
import { texte } from "@/i18n";
import {
  ANTWORT_SCHEMA,
  PLAN_SCHEMA,
  entferneFreieZahlen,
  leereArtWerte,
  pruefeAntwort,
  pruefePlan,
  sortiereZeilen,
  zerlegeText,
  type FrageDaten,
} from "@/lib/ki-antwort";

const t = texte("de-DE");
const objekte = {
  gesellschaften: [{ code: "G01", id: "g1", name: "Elbufer" }, { code: "G02", id: "g2", name: "Isartal" }],
  haeuser: [{ code: "H01", id: "h1", name: "Alsterblick 27", gesellschaft: "G01" }],
};
const daten: FrageDaten = {
  objekte,
  ergebnisse: [
    { id: "A1", art: "KENNZAHLEN", objekt: "ALLE", objektName: "Alle", stichtag: "2026-11-28", typ: "werte", felder: ["sollJahr", "ltv"], werte: { sollJahr: { w: "120000" }, ltv: { w: null } }, nachArt: leereArtWerte() },
    {
      id: "A2", art: "GESELLSCHAFTEN", objekt: "ALLE", objektName: "Alle", stichtag: "2026-11-28", typ: "tabelle", felder: ["leerstandQuote", "sollJahr"],
      zeilen: [
        { code: "G01", name: "Elbufer", href: "/g/1", werte: { leerstandQuote: { w: "3.5" } } },
        { code: "G02", name: "Isartal", href: "/g/2", werte: { leerstandQuote: { w: null } } },
        { code: "G03", name: "Lindenhof", href: "/g/3", werte: { leerstandQuote: { w: "7.1" } } },
      ],
    },
    { id: "A3", art: "VERLAUF", objekt: "ALLE", objektName: "Alle", stichtag: "2026-11-28", typ: "reihe", felder: ["verkehrswert", "restschuld"], punkte: [] },
  ],
};
const leer = { titel: "Titel", text: null, abfrage: null, felder: [], sortierFeld: null, absteigend: true, zeilen: "alle", objekt: null, regler: [] };

/** Sucht rekursiv nach Zahlenfeldern im Schema. */
function zahlenTypen(schema: unknown): string[] {
  if (!schema || typeof schema !== "object") return [];
  const s = schema as Record<string, unknown>;
  const eigen = s.type === "number" || s.type === "integer" ? [String(s.type)] : [];
  return [...eigen, ...Object.values(s).flatMap(zahlenTypen)];
}

describe("KI-Antworten", () => {
  it("die Schemata enthalten kein Zahlenfeld: die KI kann keine Werte liefern", () => {
    expect(zahlenTypen(PLAN_SCHEMA)).toEqual([]);
    expect(zahlenTypen(ANTWORT_SCHEMA)).toEqual([]);
  });

  it("Plan: nur bekannte Arten und sichtbare Kürzel, ohne Doppelungen", () => {
    const plan = pruefePlan(
      { abfragen: [{ art: "KENNZAHLEN", objekt: "g01" }, { art: "KENNZAHLEN", objekt: "G01" }, { art: "HAEUSER", objekt: "H01" }, { art: "GESELLSCHAFTEN", objekt: "G09" }, { art: "XYZ", objekt: "ALLE" }, { art: "VERLAUF", objekt: "H01" }] },
      objekte,
    );
    expect(plan).toEqual([{ art: "KENNZAHLEN", objekt: "G01" }, { art: "VERLAUF", objekt: "H01" }]);
    expect(pruefePlan({ abfragen: [] }, objekte)).toEqual([{ art: "KENNZAHLEN", objekt: "ALLE" }]);
  });

  it("freie Zahlen im Text werden entfernt, Jahre, Kürzel und Platzhalter bleiben", () => {
    const r = entferneFreieZahlen("Seit 2021 stieg die Miete in G03 um 4,5 % auf {A1.sollJahr}; der LTV liegt bei 62.");
    expect(r.text).toBe("Seit 2021 stieg die Miete in G03 um [?] % auf {A1.sollJahr}; der LTV liegt bei [?].");
    expect(r.entfernt).toBe(2);
  });

  it("Platzhalter: gültige Werte und Zeilen werden erkannt, ungültige zu [?]", () => {
    const { teile, ungueltig } = zerlegeText("Miete {A1.sollJahr}, G01 {A2.G01.leerstandQuote}, falsch {A1.dscr} {A9.ltv} {A2.ltv}", daten);
    expect(ungueltig).toBe(3);
    expect(teile.filter((x) => "feld" in x)).toEqual([
      { abfrage: "A1", zeile: null, feld: "sollJahr" },
      { abfrage: "A2", zeile: "G01", feld: "leerstandQuote" },
    ]);
  });

  it("Bausteine werden gegen die Daten geprüft; unpassende entfallen mit Hinweis", () => {
    const a = pruefeAntwort(
      {
        bausteine: [
          { ...leer, typ: "TEXT", titel: null, text: "Die Miete beträgt {A1.sollJahr}, also rund 120000 Euro." },
          { ...leer, typ: "KACHELN", abfrage: "A1", felder: ["sollJahr", "ltv", "dscr"] },
          { ...leer, typ: "TABELLE", abfrage: "A1", felder: ["sollJahr"] },
          { ...leer, typ: "SAEULEN", abfrage: "A2", felder: ["leerstandQuote"], zeilen: "top5" },
          { ...leer, typ: "LINIE", abfrage: "A3", felder: ["verkehrswert"] },
          { ...leer, typ: "REGLER", objekt: "G02", regler: ["mietsteigerung", "mietsteigerung"] },
          { ...leer, typ: "REGLER", objekt: "G77", regler: ["mietsteigerung"] },
          { ...leer, typ: "KREIS", abfrage: "A5" },
        ],
      },
      daten,
      t.kiFragen.pruefung,
    );
    expect(a.bausteine.map((b) => b.typ)).toEqual(["TEXT", "KACHELN", "SAEULEN", "LINIE", "REGLER"]);
    const text = a.bausteine[0];
    expect(text.typ === "TEXT" && text.text).toBe("Die Miete beträgt {A1.sollJahr}, also rund [?] Euro.");
    expect(text.hinweise).toHaveLength(1);
    const kacheln = a.bausteine[1];
    expect(kacheln.typ === "KACHELN" && kacheln.felder).toEqual(["sollJahr", "ltv"]);
    const regler = a.bausteine[4];
    expect(regler.typ === "REGLER" && regler.regler).toEqual(["mietsteigerung"]);
    expect(a.verworfen).toHaveLength(3);
  });

  it("Sortierung: unbekannte Werte stehen immer am Ende und zählen nicht als 0", () => {
    const zeilen = (daten.ergebnisse[1] as Extract<FrageDaten["ergebnisse"][number], { typ: "tabelle" }>).zeilen;
    expect(sortiereZeilen(zeilen, "leerstandQuote", true, "alle").map((z) => z.code)).toEqual(["G03", "G01", "G02"]);
    expect(sortiereZeilen(zeilen, "leerstandQuote", false, "alle").map((z) => z.code)).toEqual(["G01", "G03", "G02"]);
    expect(sortiereZeilen(zeilen, "leerstandQuote", true, "top5")).toHaveLength(3);
  });
});
