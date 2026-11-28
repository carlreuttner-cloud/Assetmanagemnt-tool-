import { describe, expect, it } from "vitest";
import { dezimal } from "../src/lib/geld";
import { standAm, standSummen, summenAenderung, vergleicheStaende, vorherigerStichtag, zusammenfassung, type StandZeile } from "../src/lib/mieterstand";

const z = (einheit: string, w: Partial<StandZeile> = {}): StandZeile => ({
  schluessel: einheit,
  einheit,
  art: "WOHNUNG",
  flaeche: dezimal(60),
  leer: false,
  mieter: `Mieter ${einheit}`,
  beginn: "2020-01-01",
  ende: null,
  sollMiete: dezimal(600),
  istMiete: dezimal(600),
  nebenkosten: dezimal(150),
  erwarteteMiete: null,
  ...w,
});

describe("Stände der Mieterliste", () => {
  it("wertet Mieterhöhung, Minderung, Neuvermietung, neuen Leerstand und Mieterwechsel", () => {
    const alt = [z("1"), z("2"), z("3", { leer: true, mieter: null, sollMiete: null, istMiete: null, erwarteteMiete: dezimal(700) }), z("4"), z("5")];
    const neu = [
      z("1", { istMiete: dezimal(650), sollMiete: dezimal(650) }),
      z("2", { istMiete: dezimal(540) }),
      z("3", { mieter: "Neu", istMiete: dezimal(720), sollMiete: dezimal(720) }),
      z("4", { leer: true, mieter: null, sollMiete: null, istMiete: null, erwarteteMiete: dezimal(650) }),
      z("5", { mieter: "Nachmieter", beginn: "2026-10-01" }),
    ];
    const v = vergleicheStaende(alt, neu);
    expect(v.map((x) => x.ereignisse)).toEqual([["mieterhoehung"], ["minderung"], ["neuvermietung"], ["neuerLeerstand"], ["mieterwechsel"]]);
    expect(v[0].aenderungen.istMiete?.wertung).toBe("besser");
    expect(v[0].aenderungen.istMiete?.differenz?.toString()).toBe("50");
    expect(v[0].aenderungen.istMiete?.prozent?.toString()).toBe("8.33");
    expect(v[1].aenderungen.istMiete?.wertung).toBe("schlechter");
    expect(v[2].aenderungen.leer?.wertung).toBe("besser");
    expect(v[3].aenderungen.leer?.wertung).toBe("schlechter");
    // Mieterwechsel bei gleicher Miete: neutral, keine Mietänderung
    expect(v[4].aenderungen.mieter?.wertung).toBe("neutral");
    expect(v[4].aenderungen.istMiete).toBeUndefined();
    const s = zusammenfassung(v);
    expect(s.find((e) => e.art === "mieterhoehung")?.betrag?.toString()).toBe("50");
    expect(s.find((e) => e.art === "neuerLeerstand")?.betrag?.toString()).toBe("-600");
    expect(s.find((e) => e.art === "neuvermietung")?.betrag?.toString()).toBe("720");
    expect(s.find((e) => e.art === "mieterwechsel")?.betrag).toBeNull();
  });

  it("wertet fehlende Werte nie als Änderung", () => {
    const v = vergleicheStaende([z("1", { nebenkosten: null, istMiete: null })], [z("1", { istMiete: dezimal(700) })]);
    expect(v[0].aenderungen).toEqual({});
    expect(v[0].ereignisse).toEqual([]);
    // unbekannter Vermietungsstand (nur Leerstandsdaten) ist keine Neuvermietung
    const u = vergleicheStaende([z("1", { leer: null, mieter: null, istMiete: null })], [z("1")]);
    expect(u[0].ereignisse).toEqual([]);
  });

  it("kennzeichnet Flächenkorrekturen neutral und Einheiten, die neu sind oder fehlen", () => {
    const v = vergleicheStaende([z("1"), z("2")], [z("1", { flaeche: dezimal(62) }), z("3")]);
    expect(v[0].aenderungen.flaeche?.wertung).toBe("neutral");
    expect(v[0].ereignisse).toContain("korrektur");
    expect(v.find((x) => x.schluessel === "3")?.ereignisse).toEqual(["neu"]);
    expect(v.find((x) => x.schluessel === "2")?.ereignisse).toEqual(["entfallen"]);
  });

  it("rechnet Summen und markiert sie als unvollständig", () => {
    const s = standSummen([z("1"), z("2", { leer: true, mieter: null, istMiete: null, sollMiete: null, erwarteteMiete: dezimal(500), flaeche: dezimal(40) }), z("P", { art: "STELLPLATZ", flaeche: null, istMiete: dezimal(50) })]);
    expect(s.istMonat.wert?.toString()).toBe("650");
    expect(s.flaeche.wert?.toString()).toBe("100");
    expect(s.leerFlaeche.wert?.toString()).toBe("40");
    expect(s.leerQuote.wert?.toString()).toBe("40");
    expect(s.entgangenMonat.wert?.toString()).toBe("500");
    expect(s.istMonat.unvollstaendig).toBe(false);
    const u = standSummen([z("1", { istMiete: null }), z("2")]);
    expect(u.istMonat.wert?.toString()).toBe("600");
    expect(u.istMonat.unvollstaendig).toBe(true);
    const a = summenAenderung("leerQuote", { wert: dezimal(10), unvollstaendig: false }, { wert: dezimal(15), unvollstaendig: false });
    expect(a?.wertung).toBe("schlechter");
    expect(summenAenderung("istMonat", { wert: dezimal(1000), unvollstaendig: false }, { wert: dezimal(1100), unvollstaendig: false })?.wertung).toBe("besser");
    expect(summenAenderung("flaeche", { wert: dezimal(100), unvollstaendig: false }, { wert: dezimal(102), unvollstaendig: false })?.wertung).toBe("neutral");
    expect(summenAenderung("istMonat", { wert: null, unvollstaendig: true }, { wert: dezimal(1), unvollstaendig: false })).toBeNull();
  });

  it("wählt den neuesten Stand bis zum Stichtag", () => {
    const staende = [
      { id: "a", stichtag: "2026-09-30", erstelltAm: "2026-10-01T00:00:00Z" },
      { id: "b", stichtag: "2026-10-31", erstelltAm: "2026-11-01T00:00:00Z" },
      { id: "c", stichtag: "2026-10-31", erstelltAm: "2026-11-02T00:00:00Z" },
    ];
    expect(standAm(staende, "2026-10-31")?.id).toBe("c");
    expect(standAm(staende, "2026-10-15")?.id).toBe("a");
    expect(standAm(staende, "2026-01-01")).toBeNull();
    expect(vorherigerStichtag(["2026-10-31", "2026-09-30", "2026-08-31"], "2026-10-31")).toBe("2026-09-30");
    expect(vorherigerStichtag(["2026-10-31"], "2026-10-31")).toBeNull();
  });
});
