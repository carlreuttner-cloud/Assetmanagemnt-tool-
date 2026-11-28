import { describe, expect, it } from "vitest";
import {
  ausschnitt,
  einheitlicherName,
  erkenneAbsender,
  erkenneDatum,
  erkenneJahr,
  erkenneKategorie,
  erkenneObjekt,
  markiere,
  type ObjektKandidat,
} from "@/lib/dokument-vorschlag";

const kandidaten: ObjektKandidat[] = [
  { art: "gesellschaft", id: "g1", name: "Lindenhof Wohnen GmbH & Co. KG", begriffe: ["HRA 990011 B"] },
  { art: "haus", id: "h1", name: "Lindenhofstraße 12", begriffe: ["Lindenhofstraße 12"] },
  { art: "kredit", id: "k1", name: "Darlehen 1 (Lindenhof)", begriffe: ["DE12 3456 7890 1234 5678 90", "4711-0815"] },
];

describe("Dokument-Vorschlag", () => {
  it("erkennt die Kategorie aus Text und Dateiname", () => {
    expect(erkenneKategorie("Jahresabschluss zum 31.12.2025 … Bilanz zum 31.12.2025", "scan.pdf")?.kategorie).toBe("Jahresabschluss");
    expect(erkenneKategorie("", "Grundbuch_Abruf.pdf")?.kategorie).toBe("Grundbuchauszug");
    expect(erkenneKategorie("Lorem ipsum", "x.pdf")).toBeNull();
  });

  it("erkennt das Jahr aus Text, sonst aus dem Dateinamen", () => {
    expect(erkenneJahr("Geschäftsjahr 2024", "JA.pdf")).toBe(2024);
    expect(erkenneJahr("Bilanz zum 31.12.2025", "x.pdf")).toBe(2025);
    expect(erkenneJahr("ohne", "JA2023_final.pdf")).toBe(2023);
    expect(erkenneJahr("ohne", "scan.pdf")).toBeNull();
  });

  it("nimmt das Ausstellungsdatum statt eines Ablaufdatums", () => {
    expect(erkenneDatum("Gültig bis: 30.06.2034\nAusgestellt am 01.07.2024")).toBe("2024-07-01");
    expect(erkenneDatum("Gültig bis: 30.06.2034")).toBeNull();
    expect(erkenneDatum("Köln, 5.3.2026")).toBe("2026-03-05");
    expect(erkenneDatum("31.13.2026")).toBeNull();
  });

  it("ordnet über Name oder Kennung zu, Kennungen ohne Leerzeichen", () => {
    expect(erkenneObjekt("Eigentümer: Lindenhof Wohnen GmbH & Co. KG", kandidaten, null)?.objekt.id).toBe("g1");
    expect(erkenneObjekt("IBAN DE12345678901234567890", kandidaten, "kredit")?.objekt.id).toBe("k1");
    expect(erkenneObjekt("nichts Passendes", kandidaten, null)).toBeNull();
  });

  it("bildet den einheitlichen Namen", () => {
    expect(einheitlicherName({ kategorie: "Jahresabschluss", jahr: 2025, datum: null, objekt: "Gesellschaft XY" }, "Dokument")).toBe(
      "Jahresabschluss 2025 – Gesellschaft XY",
    );
    expect(einheitlicherName({ kategorie: "Grundbuchauszug", jahr: null, datum: "2026-03-14", objekt: null }, "Dokument")).toBe("Grundbuchauszug 14.03.2026");
    expect(einheitlicherName({ kategorie: null, jahr: null, datum: null, objekt: null }, "Dokument")).toBe("Dokument");
  });

  it("markiert Fundstellen ohne Rücksicht auf Groß-/Kleinschreibung", () => {
    const teile = markiere("Grundschuld und GRUNDSCHULD", "grundschuld");
    expect(teile.filter((t) => t.treffer).map((t) => t.text)).toEqual(["Grundschuld", "GRUNDSCHULD"]);
    expect(teile.map((t) => t.text).join("")).toBe("Grundschuld und GRUNDSCHULD");
    expect(ausschnitt("aaa Flurstück 345/7 bbb", "flurstück")?.treffer).toBe("Flurstück");
    expect(ausschnitt("aaa", "zzz")).toBeNull();
  });
});

describe("Absender", () => {
  it("bekannte Bank aus den Krediten hat Vorrang", () => {
    expect(erkenneAbsender("Saldenbestätigung\nSparkasse Hamburg\nDarlehen 4711", "Saldenbestätigung", ["Sparkasse Hamburg", "Deutsche Bank"])).toEqual({ art: "BANK", name: "Sparkasse Hamburg", grund: "bekannteBank", begriff: "Sparkasse Hamburg" });
  });
  it("Stichwort im Kopf mit Satzteil als Name", () => {
    expect(erkenneAbsender("Grundbuch von Hamburg\nAmtsgericht Hamburg, Grundbuchamt. Abruf vom 14.03.2026", "Grundbuchauszug", [])).toMatchObject({ art: "BEHOERDE", name: "Amtsgericht Hamburg, Grundbuchamt", grund: "stichwort" });
    expect(erkenneAbsender("Müller Hausverwaltung GmbH\nNebenkostenabrechnung 2025", null, [])).toMatchObject({ art: "HAUSVERWALTUNG", name: "Müller Hausverwaltung GmbH" });
  });
  it("Registergericht im Briefkopf macht einen Jahresabschluss nicht zur Behördenpost", () => {
    expect(erkenneAbsender("Jahresabschluss zum 31.12.2025\nLindenhof GmbH\nAmtsgericht Berlin (Charlottenburg), HRA 990011 B", "Jahresabschluss", [])).toEqual({ art: "STEUERBERATER", name: null, grund: "kategorie", begriff: "Jahresabschluss" });
  });
  it("ohne Hinweise kein Vorschlag (unbekannt statt geraten)", () => {
    expect(erkenneAbsender("Sehr geehrte Damen und Herren", null, [])).toBeNull();
  });
});
