import { describe, expect, it } from "vitest";
import { findeIbans, findeKennungen, kombiniereKi, lerneRegeln, normalisiere, schlageVor, sicherheitAus, type EingangKandidat, type Regel } from "@/lib/eingang";

const kredit: EingangKandidat = { art: "kredit", id: "k1", name: "Darlehen Sparkasse 4711", ibans: ["DE89 3704 0044 0532 0130 00"], kennungen: ["4711-2020"], adressen: [], namen: [] };
const haus: EingangKandidat = { art: "haus", id: "h1", name: "Lindenstraße 5", ibans: [], kennungen: [], adressen: ["Lindenstraße 5"], namen: [] };
const ges: EingangKandidat = { art: "gesellschaft", id: "g1", name: "Muster Immobilien GmbH", ibans: [], kennungen: [], adressen: [], namen: ["Muster Immobilien GmbH"] };
const kandidaten = [kredit, haus, ges];
const basis = { dateiname: "scan.pdf", kandidaten, regeln: [] as Regel[], banken: ["Sparkasse"], absenderAdresse: null, ohneKategorie: "Dokument" };

describe("Posteingang: Erkennung", () => {
  it("findet IBANs und Darlehensnummern", () => {
    expect(findeIbans("IBAN: DE89 3704 0044 0532 0130 00 bitte")).toEqual(["DE89370400440532013000"]);
    expect(findeKennungen("Darlehens-Nr.: 4711-2020 vom")).toEqual(["4711-2020"]);
    expect(findeKennungen("Kontonummer: ABCDEF")).toEqual([]);
  });

  it("ordnet über die IBAN sicher dem Kredit zu und begründet das", () => {
    const v = schlageVor({ ...basis, text: "Sparkasse\nKontoauszug zum 31.12.2025\nIBAN DE89 3704 0044 0532 0130 00\nSaldo" });
    expect(v.objekt?.id).toBe("k1");
    expect(v.sicherheit).toBe("hoch");
    expect(v.gruende.some((g) => g.schluessel === "iban")).toBe(true);
  });

  it("bleibt ohne Treffer unsicher und schlägt kein Objekt vor", () => {
    const v = schlageVor({ ...basis, text: "Irgendein Schreiben ohne Bezug" });
    expect(v.objekt).toBeNull();
    expect(v.sicherheit).toBe("niedrig");
  });

  it("Sicherheit hängt von Punkten und Abstand ab", () => {
    expect(sicherheitAus(8, 0)).toBe("hoch");
    expect(sicherheitAus(8, 6)).toBe("mittel");
    expect(sicherheitAus(3, 0)).toBe("mittel");
    expect(sicherheitAus(2, 0)).toBe("niedrig");
  });

  it("eine gelernte Absender-Regel setzt den Absender, aber nicht das Objekt", () => {
    const regel: Regel = { merkmal: "ABSENDER_ADRESSE", wert: normalisiere("post@hv-beispiel.de"), objekt: { art: "haus", id: "h1", name: "Lindenstraße 5" }, absenderArt: "HAUSVERWALTUNG", absenderName: "HV Beispiel", geaendertAm: "2026-11-01T00:00:00Z" };
    const v = schlageVor({ ...basis, regeln: [regel], absenderAdresse: "post@hv-beispiel.de", text: "Abrechnung Muster Immobilien GmbH" });
    expect(v.objekt?.id).toBe("g1");
    expect(v.absenderArt).toBe("HAUSVERWALTUNG");
    expect(v.absenderName).toBe("HV Beispiel");
  });

  it("eine gelernte IBAN-Regel ordnet sicher zu", () => {
    const regel: Regel = { merkmal: "IBAN", wert: "de02120300000000202051", objekt: { art: "haus", id: "h1", name: "Lindenstraße 5" }, absenderArt: null, absenderName: null, geaendertAm: "2026-11-01T00:00:00Z" };
    const v = schlageVor({ ...basis, regeln: [regel], text: "Nebenkosten, Zahlung an DE02 1203 0000 0000 2020 51" });
    expect(v.objekt?.id).toBe("h1");
    expect(v.sicherheit).toBe("hoch");
    expect(v.gruende.some((g) => g.schluessel === "regel")).toBe(true);
  });
});

describe("Posteingang: KI und Lernen", () => {
  const codes = new Map([["O1", { art: "kredit" as const, id: "k1", name: kredit.name }], ["O2", { art: "haus" as const, id: "h1", name: haus.name }]]);
  const ki = { kategorie: "", absenderArt: "", absenderName: "", datum: "", jahr: "", objekt: "O2", beleg: "Objekt Lindenstr. 5", begruendung: "Adresse" };

  it("übernimmt den KI-Vorschlag nur mit wörtlichem Beleg und nie als sicher", () => {
    const text = "Schreiben zum Objekt Lindenstr. 5 in Musterstadt";
    const v = schlageVor({ ...basis, text });
    const mit = kombiniereKi(v, ki, text, codes, "modell", "Dokument");
    expect(mit.objekt?.id).toBe("h1");
    expect(mit.sicherheit).toBe("mittel");
    const ohne = kombiniereKi(v, { ...ki, beleg: "erfundener Beleg" }, text, codes, "modell", "Dokument");
    expect(ohne.objekt?.id ?? null).toBe(v.objekt?.id ?? null);
  });

  it("senkt die Sicherheit, wenn die KI widerspricht", () => {
    const text = "IBAN DE89 3704 0044 0532 0130 00 Objekt Lindenstr. 5";
    const v = schlageVor({ ...basis, text });
    expect(v.sicherheit).toBe("hoch");
    const r = kombiniereKi(v, ki, text, codes, "modell", "Dokument");
    expect(r.objekt?.id).toBe("k1");
    expect(r.sicherheit).toBe("mittel");
  });

  it("lernt aus der Korrektur neue IBAN und Absenderadresse", () => {
    const regeln = lerneRegeln({ text: "IBAN DE02 1203 0000 0000 2020 51", absenderAdresse: "Info@HV-Beispiel.de", kandidaten, objekt: { art: "haus", id: "h1", name: "Lindenstraße 5" }, absenderArt: "HAUSVERWALTUNG", absenderName: "HV Beispiel" });
    expect(regeln.find((r) => r.merkmal === "IBAN")?.objekt?.id).toBe("h1");
    expect(regeln.find((r) => r.merkmal === "ABSENDER_ADRESSE")?.absenderArt).toBe("HAUSVERWALTUNG");
    const bekannte = lerneRegeln({ text: "IBAN DE89 3704 0044 0532 0130 00", absenderAdresse: null, kandidaten, objekt: { art: "haus", id: "h1", name: "x" }, absenderArt: null, absenderName: null });
    expect(bekannte.some((r) => r.merkmal === "IBAN")).toBe(false);
  });
});
