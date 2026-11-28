/**
 * Gemeinsame Bausteine für PDF-Berichte: Text mit Umbruch, Überschriften, Tabellen, Seitenumbruch.
 * Erzeugt mit pdf-lib (MIT-Lizenz, als Abhängigkeit); Layout ist eigener Code.
 */
import "server-only";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export const A4 = { breite: 595.28, hoehe: 841.89 };
export const RAND = 48;
export const GRAU = rgb(0.4, 0.45, 0.5);
export const DUNKEL = rgb(0.1, 0.12, 0.16);
export const ROT = rgb(0.7, 0.1, 0.1);
export const GRUEN = rgb(0.05, 0.45, 0.25);

/** Standardschriften kennen nur WinAnsi: Zeichen außerhalb ersetzen. */
export function pdfText(text: string): string {
  return text
    .replace(/[   ]/g, " ")
    .replace(/−/g, "-")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/[^\n\x20-\x7e\xa0-\xff€–—‘’‚“”„†‡•…‰‹›ŒœŠšŸŽžƒˆ˜™]/g, "?");
}

export type Spalte = { titel: string; breite: number; rechts?: boolean };

export class Schreiber {
  seiten: PDFPage[] = [];
  seite!: PDFPage;
  y = 0;
  constructor(
    private doc: PDFDocument,
    private normal: PDFFont,
    private fett: PDFFont,
  ) {
    this.neueSeite();
  }
  neueSeite() {
    this.seite = this.doc.addPage([A4.breite, A4.hoehe]);
    this.seiten.push(this.seite);
    this.y = A4.hoehe - RAND;
  }
  platz(hoehe: number) {
    if (this.y - hoehe < RAND + 8) this.neueSeite();
  }
  zeilen(text: string, groesse: number, breite: number, font: PDFFont): string[] {
    const ergebnis: string[] = [];
    for (const absatz of pdfText(text).split("\n")) {
      let zeile = "";
      for (const wort of absatz.split(" ")) {
        const probe = zeile ? `${zeile} ${wort}` : wort;
        if (font.widthOfTextAtSize(probe, groesse) > breite && zeile) {
          ergebnis.push(zeile);
          zeile = wort;
        } else zeile = probe;
      }
      ergebnis.push(zeile);
    }
    return ergebnis;
  }
  text(text: string, o: { groesse?: number; fett?: boolean; farbe?: ReturnType<typeof rgb>; abstand?: number } = {}) {
    const groesse = o.groesse ?? 9.5;
    const font = o.fett ? this.fett : this.normal;
    for (const z of this.zeilen(text, groesse, A4.breite - 2 * RAND, font)) {
      this.platz(groesse * 1.4);
      this.seite.drawText(z, { x: RAND, y: this.y - groesse, size: groesse, font, color: o.farbe ?? DUNKEL });
      this.y -= groesse * 1.4;
    }
    this.y -= o.abstand ?? 2;
  }
  ueberschrift(text: string) {
    this.platz(40);
    this.y -= 6;
    this.text(text, { groesse: 12, fett: true, abstand: 4 });
  }
  tabelle(spalten: Spalte[], zeilen: Array<Array<{ text: string; farbe?: ReturnType<typeof rgb>; fett?: boolean }>>) {
    const groesse = 8.5;
    const gesamt = spalten.reduce((s, c) => s + c.breite, 0);
    const faktor = (A4.breite - 2 * RAND) / gesamt;
    const breiten = spalten.map((c) => c.breite * faktor);
    const zeile = (zellen: Array<{ text: string; farbe?: ReturnType<typeof rgb>; fett?: boolean }>, kopf: boolean) => {
      const umbrochen = zellen.map((c, i) => this.zeilen(c.text, groesse, breiten[i] - 6, kopf || c.fett ? this.fett : this.normal));
      const hoehe = Math.max(...umbrochen.map((u) => u.length)) * groesse * 1.3 + 4;
      this.platz(hoehe);
      let x = RAND;
      umbrochen.forEach((u, i) => {
        const font = kopf || zellen[i].fett ? this.fett : this.normal;
        u.forEach((t, j) => {
          const w = font.widthOfTextAtSize(t, groesse);
          const tx = spalten[i].rechts ? x + breiten[i] - 3 - w : x + 3;
          this.seite.drawText(t, { x: tx, y: this.y - groesse - 2 - j * groesse * 1.3, size: groesse, font, color: kopf ? GRAU : (zellen[i].farbe ?? DUNKEL) });
        });
        x += breiten[i];
      });
      this.y -= hoehe;
      this.seite.drawLine({ start: { x: RAND, y: this.y }, end: { x: A4.breite - RAND, y: this.y }, thickness: kopf ? 0.8 : 0.3, color: rgb(0.8, 0.82, 0.85) });
    };
    zeile(spalten.map((s) => ({ text: s.titel })), true);
    for (const z of zeilen) zeile(z, false);
    this.y -= 6;
  }
}

/** Neues Dokument mit Schreiber (Helvetica normal und fett). */
export async function neuesPdf(titel: string, erstellt: Date) {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfText(titel));
  doc.setCreator("Immobilien-Portfolio");
  doc.setCreationDate(erstellt);
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const s = new Schreiber(doc, normal, await doc.embedFont(StandardFonts.HelveticaBold));
  return { doc, s, normal };
}

/** Fußzeile mit Seitenzahl auf jeder Seite; optional „Entwurf“ quer über jede Seite. */
export function fusszeilen(s: Schreiber, font: PDFFont, text: (seite: number, seiten: number) => string, wasserzeichen?: string) {
  s.seiten.forEach((p, i) => {
    p.drawText(pdfText(text(i + 1, s.seiten.length)), { x: RAND, y: RAND - 20, size: 7.5, font, color: GRAU });
    if (wasserzeichen) {
      p.drawText(pdfText(wasserzeichen), { x: 140, y: 300, size: 80, font, color: rgb(0.85, 0.3, 0.3), opacity: 0.18, rotate: degrees(35) });
    }
  });
}
