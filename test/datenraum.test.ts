import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { csv, dateiName, ordneDokumente, sichererName, type DatenraumDokument } from "../src/lib/datenraum";
import { crc32, zipPuffer } from "../src/lib/zip";

const N = { gesellschaft: "Gesellschaft", haeuser: "Haeuser", haus: "Haus", kredite: "Kredite", mietverhaeltnisse: "Mietverhaeltnisse", ohneKategorie: "Sonstiges" };
const dok = (o: Partial<DatenraumDokument>): DatenraumDokument => ({
  id: "d",
  titel: "Dokument",
  kategorie: null,
  jahr: null,
  dokumentDatum: null,
  dateiname: "x.pdf",
  mimeType: "application/pdf",
  groesseBytes: 1,
  pruefsumme: null,
  bestaetigt: true,
  absender: null,
  gesellschaft: null,
  haus: null,
  einheit: null,
  mieter: null,
  kredit: null,
  ...o,
});

describe("Datenraum", () => {
  it("macht Namen sicher und ersetzt Umlaute", () => {
    expect(sichererName("Jahresabschluss 2025 – Lindenhof Wohnen GmbH & Co. KG")).toBe("Jahresabschluss 2025 - Lindenhof Wohnen GmbH und Co. KG");
    expect(sichererName("Grundbuch: Blatt 12/3 *neu*")).toBe("Grundbuch- Blatt 12-3 -neu");
    expect(sichererName("Straße")).toBe("Strasse");
    expect(sichererName("   ")).toBe("-");
  });

  it("Dateiname mit Datum oder Jahr vorne und Endung", () => {
    expect(dateiName(dok({ titel: "Kaufvertrag", dokumentDatum: "2019-03-01", dateiname: "scan.PDF" }))).toBe("2019-03-01 Kaufvertrag.pdf");
    expect(dateiName(dok({ titel: "Jahresabschluss", jahr: 2024, dateiname: "ja", mimeType: "image/png" }))).toBe("2024 Jahresabschluss.png");
  });

  it("ordnet nach Gesellschaft, Krediten, Häusern und Mietverhältnissen", () => {
    const e = ordneDokumente(
      [
        dok({ id: "1", titel: "Satzung", kategorie: "Gesellschaftsvertrag", gesellschaft: "G" }),
        dok({ id: "2", titel: "Darlehensvertrag", kategorie: "Kreditvertrag", kredit: "K01", gesellschaft: "G" }),
        dok({ id: "3", titel: "Gutachten", kategorie: "Gutachten", haus: "Lindenstraße 5" }),
        dok({ id: "4", titel: "Mietvertrag", haus: "Lindenstraße 5", einheit: "WE 01", mieter: "Müller" }),
      ],
      "gesellschaft",
      N,
      "Datenraum Lindenhof",
    );
    expect(e.map((x) => x.pfad)).toEqual([
      "Datenraum Lindenhof/1 Gesellschaft/Gesellschaftsvertrag/Satzung.pdf",
      "Datenraum Lindenhof/2 Kredite/K01/Kreditvertrag/Darlehensvertrag.pdf",
      "Datenraum Lindenhof/3 Haeuser/Lindenstrasse 5/Gutachten/Gutachten.pdf",
      "Datenraum Lindenhof/3 Haeuser/Lindenstrasse 5/Mietverhaeltnisse/WE 01 - Mueller/Mietvertrag.pdf",
    ]);
    expect(e.map((x) => x.nr)).toEqual([1, 2, 3, 4]);
  });

  it("Hauspaket und doppelte Namen", () => {
    const e = ordneDokumente([dok({ id: "a", titel: "Foto", haus: "H" }), dok({ id: "b", titel: "Foto", haus: "H" })], "haus", N, "H");
    expect(e.map((x) => x.pfad)).toEqual(["H/1 Haus/Sonstiges/Foto.pdf", "H/1 Haus/Sonstiges/Foto (2).pdf"]);
  });

  it("CSV mit BOM, Semikolon und Anführungszeichen", () => {
    expect(csv([["a", "b;c", null], [1, 'x"y', "z"]])).toBe('﻿a;"b;c";\r\n1;"x""y";z\r\n');
  });

  it("CRC32 stimmt mit dem Prüfwert überein", () => {
    expect(crc32(new TextEncoder().encode("123456789")).toString(16)).toBe("cbf43926");
  });

  it("schreibt ein ZIP, das unzip prüfen und lesen kann", async () => {
    const text = "Inhaltsverzeichnis äöü\n".repeat(200);
    const zip = await zipPuffer([
      { pfad: "Paket/00 Inhalt.csv", datum: new Date("2026-11-28T10:00:00Z"), komprimieren: true, inhalt: async () => new TextEncoder().encode(text) },
      { pfad: "Paket/1 Haus/Datei.pdf", datum: new Date("2026-11-28T10:00:00Z"), komprimieren: false, inhalt: async () => new Uint8Array([37, 80, 68, 70]) },
    ]);
    const ordner = mkdtempSync(join(tmpdir(), "zip-"));
    const datei = join(ordner, "t.zip");
    writeFileSync(datei, zip);
    let unzip: string | null = null;
    try {
      unzip = execFileSync("unzip", ["-t", datei], { encoding: "utf8" });
    } catch {
      unzip = null;
    }
    if (unzip !== null) {
      expect(unzip).toContain("No errors detected");
      expect(execFileSync("unzip", ["-p", datei, "Paket/00 Inhalt.csv"], { encoding: "utf8" })).toBe(text);
    }
    expect(zip.length).toBeLessThan(text.length);
  });
});
