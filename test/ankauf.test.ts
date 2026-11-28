import { describe, expect, it } from "vitest";
import { leseAnkauf, objektKennzahlen, vergleich, differenz, type AnkaufEingabe } from "@/lib/ankauf";
import { dezimal } from "@/lib/geld";
import { leereSummen } from "@/lib/kennzahlen";

const e: AnkaufEingabe = {
  gesellschaftId: "g1",
  kaufpreis: dezimal(2000000),
  nebenkostenProzent: dezimal(10),
  wert: dezimal(2000000),
  mieteMonat: dezimal(8000),
  bewirtschaftungJahr: dezimal(16000),
  darlehen: dezimal(1400000),
  zins: dezimal(4),
  tilgung: dezimal(2),
};

describe("Ankaufsprüfung", () => {
  it("liest Eingaben, meldet fehlende Pflichtfelder und ungültige Zahlen", () => {
    expect(leseAnkauf({})).toBeNull();
    const r = leseAnkauf({ gesellschaft: "g1", kaufpreis: "2.000.000", wert: "abc", miete: "8.000", darlehen: "1.400.000", zins: "4", tilgung: "" });
    expect(r?.fehler).toEqual([{ feld: "wert", art: "ungueltig" }, { feld: "tilgung", art: "fehlt" }]);
    const ok = leseAnkauf({ gesellschaft: "g1", kaufpreis: "2.000.000", wert: "2.000.000", miete: "8.000", darlehen: "1.400.000", zins: "4", tilgung: "2" });
    expect(ok?.eingabe?.nebenkostenProzent).toBeNull();
    expect(ok?.eingabe?.mieteMonat.toString()).toBe("8000");
  });

  it("rechnet die Objektkennzahlen", () => {
    const o = objektKennzahlen(e);
    expect(o.jahresmiete.toString()).toBe("96000");
    expect(o.gesamtinvestition?.toString()).toBe("2200000");
    expect(o.eigenkapital?.toString()).toBe("800000");
    expect(o.kapitaldienstJahr.toString()).toBe("84000");
    expect(o.bruttoanfangsrendite.toString()).toBe("4.8");
    expect(o.ltv.toString()).toBe("70");
    expect(o.dscr?.toFixed(4)).toBe("1.1429");
    expect(o.icr?.toFixed(4)).toBe("1.7143");
    expect(o.reinertrag?.toString()).toBe("80000");
    expect(o.cashflow?.toString()).toBe("-4000");
    expect(o.cashOnCash?.toString()).toBe("-0.5");
    expect(o.nettoanfangsrendite?.toFixed(4)).toBe("3.6364");
  });

  it("lässt optionale Angaben unbekannt", () => {
    const o = objektKennzahlen({ ...e, nebenkostenProzent: null, bewirtschaftungJahr: null });
    expect(o.eigenkapital).toBeNull();
    expect(o.cashOnCash).toBeNull();
    expect(o.nettoanfangsrendite).toBeNull();
  });

  it("addiert das Objekt zum Bestand", () => {
    const b = leereSummen();
    b.haeuser = 1;
    b.verkehrswert = dezimal(8000000);
    b.restschuld = dezimal(4000000);
    b.istMonat = dezimal(30000);
    b.zinsenJahr = dezimal(100000);
    b.tilgungJahr = dezimal(100000);
    b.luecken.verkehrswert = { bekannt: 1, fehlend: 0, von: "2026-01-01", bis: "2026-01-01", geschaetzt: 0 };
    b.luecken.restschuld = { bekannt: 1, fehlend: 0, von: "2026-10-31", bis: "2026-10-31", geschaetzt: 0 };
    b.luecken.kapitaldienst = { bekannt: 1, fehlend: 0, von: null, bis: null, geschaetzt: 0 };
    const v = vergleich(b, e, "2026-11-28");
    expect(v.vorher.ltv?.toString()).toBe("50");
    expect(v.nachher.ltv?.toString()).toBe("54");
    expect(v.nachher.istJahr.toString()).toBe("456000");
    expect(differenz(v, "kapitaldienstJahr")?.toString()).toBe("84000");
    // fehlt im Bestand ein Verkehrswert, bleibt der LTV auch nachher unbekannt
    b.luecken.verkehrswert.fehlend = 1;
    const u = vergleich(b, e, "2026-11-28");
    expect(u.nachher.ltv).toBeNull();
    expect(differenz(u, "ltv")).toBeNull();
  });
});
