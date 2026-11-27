import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

/**
 * Durchsuchbarer Text je Seite: zuerst die Textebene des PDFs (pdftotext), bei Scans ohne
 * Textebene Texterkennung (pdftoppm + tesseract, Deutsch und Englisch). Bilder gehen direkt
 * in die Texterkennung. Benötigt poppler-utils und tesseract-ocr (+ deutsche Sprachdaten);
 * fehlen sie, wird das Dokument ohne Text gespeichert und die Ansicht sagt warum.
 */

const ausfuehren = promisify(execFile);
const ZEITLIMIT = 120_000;
export const MAX_OCR_SEITEN = 40;
/** Weniger Zeichen je Seite gelten als „keine Textebene“ (z. B. nur Seitenzahlen eines Scans). */
const MIN_ZEICHEN_JE_SEITE = 25;

export type TextErgebnis = {
  quelle: "PDF_TEXT" | "OCR" | "KEINE";
  seiten: string[];
  seitenAnzahl: number | null;
  hinweis: "werkzeugFehlt" | "ocrGekuerzt" | "keinText" | null;
};

const fehltWerkzeug = (fehler: unknown) => (fehler as NodeJS.ErrnoException)?.code === "ENOENT";

async function pdfSeitenAnzahl(pfad: string): Promise<number | null> {
  const { stdout } = await ausfuehren("pdfinfo", [pfad], { timeout: ZEITLIMIT });
  const m = /^Pages:\s+(\d+)/m.exec(stdout);
  return m ? Number(m[1]) : null;
}

async function pdfText(pfad: string): Promise<string[]> {
  const { stdout } = await ausfuehren("pdftotext", ["-layout", "-enc", "UTF-8", pfad, "-"], { timeout: ZEITLIMIT, maxBuffer: 64 * 1024 * 1024 });
  const seiten = stdout.split("\f");
  if (seiten.length > 1 && seiten[seiten.length - 1].trim() === "") seiten.pop();
  return seiten.map((s) => s.replace(/[ \t]+\n/g, "\n").trimEnd());
}

async function ocrBild(pfad: string): Promise<string> {
  const { stdout } = await ausfuehren("tesseract", [pfad, "stdout", "-l", "deu+eng", "--psm", "3"], { timeout: ZEITLIMIT, maxBuffer: 16 * 1024 * 1024 });
  return stdout.trim();
}

async function ocrPdf(pfad: string, seiten: number): Promise<string[]> {
  const ordner = await mkdtemp(join(tmpdir(), "ocr-"));
  try {
    await ausfuehren("pdftoppm", ["-r", "250", "-gray", "-png", "-f", "1", "-l", String(seiten), pfad, join(ordner, "s")], { timeout: ZEITLIMIT * 2 });
    const bilder = (await readdir(ordner)).filter((d) => d.endsWith(".png")).sort();
    const texte: string[] = [];
    for (const b of bilder) texte.push(await ocrBild(join(ordner, b)));
    return texte;
  } finally {
    await rm(ordner, { recursive: true, force: true });
  }
}

export async function erkenneText(pfad: string, mimeType: string): Promise<TextErgebnis> {
  try {
    if (mimeType !== "application/pdf") {
      const text = await ocrBild(pfad);
      return { quelle: text ? "OCR" : "KEINE", seiten: text ? [text] : [], seitenAnzahl: 1, hinweis: text ? null : "keinText" };
    }
    const anzahl = await pdfSeitenAnzahl(pfad);
    const seiten = await pdfText(pfad);
    const zeichen = seiten.reduce((s, x) => s + x.replace(/\s/g, "").length, 0);
    if (zeichen >= MIN_ZEICHEN_JE_SEITE * Math.max(1, seiten.length)) return { quelle: "PDF_TEXT", seiten, seitenAnzahl: anzahl ?? seiten.length, hinweis: null };
    const gesamt = anzahl ?? seiten.length;
    const ocr = await ocrPdf(pfad, Math.min(gesamt, MAX_OCR_SEITEN));
    const gefunden = ocr.some((x) => x.trim().length > 0);
    return {
      quelle: gefunden ? "OCR" : "KEINE",
      seiten: ocr,
      seitenAnzahl: gesamt,
      hinweis: !gefunden ? "keinText" : gesamt > MAX_OCR_SEITEN ? "ocrGekuerzt" : null,
    };
  } catch (fehler) {
    if (fehltWerkzeug(fehler)) return { quelle: "KEINE", seiten: [], seitenAnzahl: null, hinweis: "werkzeugFehlt" };
    throw fehler;
  }
}
