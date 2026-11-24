import { describe, expect, it } from "vitest";
import { texte } from "@/i18n";
import { formatierer } from "@/lib/format";
import { dezimal } from "@/lib/geld";
import type { JahresDaten } from "@/lib/finanzen";
import { baueDatenpaket, datenpaketAlsText, pruefeErgebnis, type AnalyseEingabe } from "@/lib/ki-analyse";
import { erzeugePortfolio, STICHTAG } from "../prisma/testdaten/portfolio";
import { alsDaten } from "./hilfen/testportfolio";

const t = texte();
const f = formatierer();
const p = erzeugePortfolio();
const { haeuser, kredite } = alsDaten(p);

function eingabe(gesellschaft: string, anpassen: Partial<AnalyseEingabe> = {}): AnalyseEingabe {
  const g = p.gesellschaften.find((x) => x.schluessel === gesellschaft)!;
  return {
    stichtag: STICHTAG,
    gesellschaft: { id: g.schluessel, name: g.name, rechtsform: g.rechtsform },
    haeuser: haeuser.filter((h) => h.gesellschaftId === gesellschaft).map((h) => ({ daten: h, name: h.id, verkehrswertQuelle: "Gutachten" })),
    kredite: p.kredite
      .filter((k) => k.gesellschaft === gesellschaft)
      .map((k) => ({
        daten: kredite.find((x) => x.id === k.schluessel)!,
        name: k.bezeichnung,
        bank: "Testbank",
        covenants: (k.covenants ?? []).map((c) => ({ kennzahl: c.kennzahl, vergleich: c.vergleich, schwellenwert: c.schwellenwert ? dezimal(c.schwellenwert) : null, folge: c.folge })),
      })),
    alleHaeuser: haeuser,
    alleKredite: kredite,
    referenzwerte: [],
    geschaeftsjahre: [],
    dokumente: [],
    waterfall: { vorzugsrenditeProzent: dezimal(6), vertragQuelle: "Gesellschaftsvertrag § 14", gesellschafter: 2, ohneEinlage: 0, einlagenOhneDatum: 0, ohneGewinnanteil: 0 },
    ...anpassen,
  };
}

const jahr = (j: number, werte: Partial<JahresDaten> = {}): JahresDaten =>
  ({
    id: `J${j}`, jahr: j, beginn: `${j}-01-01`, ende: `${j}-12-31`, quelle: "JAHRESABSCHLUSS", quelleText: null, status: "ENDGUELTIG",
    umsatzerloese: dezimal(1000000), sonstigeErtraege: dezimal(0), materialaufwand: dezimal(200000), personalaufwand: dezimal(0),
    sonstigeAufwendungen: dezimal(100000), abschreibungen: dezimal(150000), zinsertraege: dezimal(0), zinsaufwendungen: dezimal(120000),
    steuern: dezimal(50000), jahresergebnis: dezimal(380000), anlagevermoegen: dezimal(9000000), umlaufvermoegen: dezimal(500000),
    liquideMittel: dezimal(300000), eigenkapital: dezimal(3000000), rueckstellungen: dezimal(100000), verbindlichkeitenBanken: dezimal(6000000),
    sonstigeVerbindlichkeiten: dezimal(400000), cashflowLaufend: null, cashflowInvestition: null, cashflowFinanzierung: null,
    ...werte,
  }) as JahresDaten;

describe("Datenpaket", () => {
  const paket = baueDatenpaket(eingabe("G1"), t, f);

  it("nummeriert Fakten und Lücken fortlaufend und gibt jedem Fakt Quelle und Wert", () => {
    expect(paket.fakten.map((x) => x.id)).toEqual(paket.fakten.map((_, i) => `F${i + 1}`));
    expect(paket.luecken.map((x) => x.id)).toEqual(paket.luecken.map((_, i) => `L${i + 1}`));
    for (const x of paket.fakten) {
      expect(x.quelle.length).toBeGreaterThan(0);
      expect(x.wert).not.toBe("–");
    }
  });

  it("enthält Jahresnettokaltmiete, LTV mit Formel und je Haus den Verkehrswert mit Stichtag", () => {
    const miete = paket.fakten.find((x) => x.objekt === paket.gesellschaft.name && x.name === t.ki.fakt.sollMiete)!;
    expect(miete.wert).toContain("Jahresnettokaltmiete");
    const ltv = paket.fakten.find((x) => x.name === "LTV")!;
    expect(ltv.quelle).toContain(t.ki.fakt.formelLtv);
    const vw = paket.fakten.filter((x) => x.name === t.ki.fakt.verkehrswert);
    expect(vw).toHaveLength(haeuser.filter((h) => h.gesellschaftId === "G1").length);
    expect(vw.every((x) => x.stichtag !== null && x.quelle === "Gutachten")).toBe(true);
  });

  it("macht fehlende Werte zu Lücken statt zu 0", () => {
    const ohneWert = eingabe("G1");
    ohneWert.haeuser = ohneWert.haeuser.map((h, i) => (i === 0 ? { ...h, daten: { ...h.daten, verkehrswerte: [] } } : h));
    const pk = baueDatenpaket(ohneWert, t, f);
    const erstes = ohneWert.haeuser[0].name;
    expect(pk.fakten.some((x) => x.objekt === erstes && x.name === t.ki.fakt.verkehrswert)).toBe(false);
    expect(pk.luecken.some((x) => x.objekt === erstes && x.text === t.ki.fakt.verkehrswertFehlt)).toBe(true);
    const summe = pk.fakten.find((x) => x.name === t.ki.fakt.verkehrswertSumme)!;
    expect(summe.wert).toContain("unvollständig");
  });

  it("meldet fehlende Geschäftsjahre, fehlende Posten und kennzeichnet Entwürfe", () => {
    const pk = baueDatenpaket(eingabe("G1", { geschaeftsjahre: [jahr(2022), jahr(2024, { status: "ENTWURF", liquideMittel: null })] }), t, f);
    expect(pk.luecken.some((x) => x.text.includes("2023"))).toBe(true);
    expect(pk.luecken.some((x) => x.text.includes("2024") && x.text.includes(t.ki.fakt.liquideMittel))).toBe(true);
    const ebitda = pk.fakten.find((x) => x.name === "EBITDA 2024")!;
    expect(ebitda.quelle).toContain(t.abschlussStatus.ENTWURF);
    expect(baueDatenpaket(eingabe("G1"), t, f).luecken.some((x) => x.text === t.ki.fakt.keineAbschluesse)).toBe(true);
  });

  it("meldet fehlende Vertragsregeln und offene Dokumente als Lücke", () => {
    const pk = baueDatenpaket(
      eingabe("G2", {
        waterfall: { vorzugsrenditeProzent: null, vertragQuelle: null, gesellschafter: 0, ohneEinlage: 0, einlagenOhneDatum: 1, ohneGewinnanteil: 0 },
        dokumente: [
          { objekt: "G2", vorgabe: "Handelsregisterauszug", status: "veraltet", href: "/x" },
          { objekt: "G2", vorgabe: "Gesellschaftsvertrag", status: "vorhanden", href: "/x" },
        ],
      }),
      t,
      f,
    );
    const texteDerLuecken = pk.luecken.map((x) => x.text);
    expect(texteDerLuecken).toContain(t.ki.fakt.vertragFehlt);
    expect(texteDerLuecken).toContain(t.ki.fakt.keineGesellschafter);
    expect(texteDerLuecken.some((x) => x.startsWith("Handelsregisterauszug"))).toBe(true);
    expect(texteDerLuecken.some((x) => x.startsWith("Gesellschaftsvertrag"))).toBe(false);
    expect(pk.fakten.find((x) => x.name === t.ki.fakt.dokumente)?.wert).toContain("1 von 2");
  });

  it("schreibt jede Nummer genau einmal in den Text für die KI", () => {
    const text = datenpaketAlsText(paket, t);
    for (const x of [...paket.fakten, ...paket.luecken]) expect(text.split(`[${x.id}]`).length - 1).toBe(1);
  });
});

describe("Prüfung der KI-Antwort", () => {
  const paket = baueDatenpaket(eingabe("G1"), t, f);
  const luecke = paket.luecken[0]?.id ?? "L1";

  it("entfernt unbekannte Verweise und markiert Aussagen ohne Fakt als ohne Beleg", () => {
    const e = pruefeErgebnis(
      {
        zusammenfassung: { text: "Kurz.", quellen: ["F1"] },
        aussagen: [
          { thema: "VERMIETUNG", art: "BEFUND", text: "Belegt.", quellen: ["[f2]", "F2", "F9999"] },
          { thema: "FINANZIERUNG", art: "EINSCHAETZUNG", text: "Nur Lücke.", quellen: [luecke] },
          { thema: "SONSTIGES", art: "ANNAHME", text: "Annahme: Markt stabil.", quellen: [] },
          { thema: "SONSTIGES", art: "EMPFEHLUNG", text: "Erfunden.", quellen: ["X1"] },
        ],
        datenluecken: [{ text: "Fehlt.", quellen: [luecke] }],
      },
      paket,
    );
    expect(e.aussagen[0]).toMatchObject({ quellen: ["F2"], unbekannt: ["F9999"], ohneBeleg: false });
    expect(e.aussagen[1].ohneBeleg).toBe(true);
    expect(e.aussagen[2].ohneBeleg).toBe(false);
    expect(e.aussagen[3]).toMatchObject({ quellen: [], unbekannt: ["X1"], ohneBeleg: true });
    expect(e.pruefung).toEqual({ ohneBeleg: 2, unbekannteVerweise: 2 });
  });

  it("lehnt Antworten im falschen Format ab", () => {
    expect(() => pruefeErgebnis({ zusammenfassung: "x", aussagen: [] }, paket)).toThrow();
    expect(() =>
      pruefeErgebnis({ zusammenfassung: { text: "", quellen: [] }, aussagen: [{ thema: "WETTER", art: "BEFUND", text: "", quellen: [] }], datenluecken: [] }, paket),
    ).toThrow();
  });
});

describe("Beispielantwort ohne KI", () => {
  it("gibt nur Fakten wieder und zeigt Annahme und ungültigen Verweis", async () => {
    const { demoErgebnis } = await import("@/lib/ki-analyse");
    const paket = baueDatenpaket(eingabe("G1"), t, f);
    const e = demoErgebnis(paket, t);
    expect(e.aussagen.filter((x) => x.art === "BEFUND").every((x) => x.quellen.length === 1 && !x.ohneBeleg)).toBe(true);
    expect(e.aussagen.some((x) => x.art === "ANNAHME")).toBe(true);
    expect(e.pruefung).toEqual({ ohneBeleg: 1, unbekannteVerweise: 1 });
  });
});
