/**
 * Schreibt die Beispiel-CSV-Dateien (Kreditbuchungen in drei Bankformaten und Übersichten)
 * nach testdaten/. Start: `npm run testdaten:csv`
 *
 * Die Dateien sind im Repository eingecheckt; ein Test prüft, dass sie zum Generator passen.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { csvDateien } from "../prisma/testdaten/bankformate";
import { erzeugePortfolio } from "../prisma/testdaten/portfolio";

const ziel = join(__dirname, "..", "testdaten");
const buchungen = join(ziel, "kreditbuchungen");

// Alte Kreditdateien entfernen, damit umbenannte Kredite keine Reste hinterlassen.
mkdirSync(buchungen, { recursive: true });
for (const datei of readdirSync(buchungen)) if (datei.endsWith(".csv")) rmSync(join(buchungen, datei));

const dateien = csvDateien(erzeugePortfolio());
for (const { pfad, inhalt } of dateien) {
  mkdirSync(dirname(join(ziel, pfad)), { recursive: true });
  writeFileSync(join(ziel, pfad), inhalt);
}
console.log(`${dateien.length} Dateien nach testdaten/ geschrieben.`);
