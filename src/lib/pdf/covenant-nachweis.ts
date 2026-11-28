/**
 * PDF des Covenant-Nachweises aus dem eingefrorenen Inhalt (`NachweisInhalt`).
 * Erzeugt mit pdf-lib (MIT-Lizenz, als Abhängigkeit); Layout und Text sind eigener Code.
 */
import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { fuelle, type Texte } from "@/i18n";
import { alsDezimal, gesamtErgebnis, type NachweisInhalt } from "@/lib/covenant-nachweis";
import type { Formatierer } from "@/lib/format";
import { dezimal } from "@/lib/geld";

const A4 = { breite: 595.28, hoehe: 841.89 };
const RAND = 48;
const GRAU = rgb(0.4, 0.45, 0.5);
const DUNKEL = rgb(0.1, 0.12, 0.16);
const ROT = rgb(0.7, 0.1, 0.1);
const GRUEN = rgb(0.05, 0.45, 0.25);

/** Standardschriften kennen nur WinAnsi: Zeichen außerhalb ersetzen. */
export function pdfText(text: string): string {
  return text
    .replace(/[   ]/g, " ")
    .replace(/−/g, "-")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/[^\n\x20-\x7e\xa0-\xff€–—‘’‚“”„†‡•…‰‹›ŒœŠšŸŽžƒˆ˜™]/g, "?");
}

type Spalte = { titel: string; breite: number; rechts?: boolean };

class Schreiber {
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

export async function covenantNachweisPdf(inhalt: NachweisInhalt, t: Texte, f: Formatierer): Promise<Uint8Array> {
  const tp = t.covenantNachweis.pdf;
  const doc = await PDFDocument.create();
  doc.setTitle(pdfText(`${t.covenantNachweis.titel} ${inhalt.kredit.bezeichnung} ${f.datum(inhalt.stichtag)}`));
  doc.setCreator("Immobilien-Portfolio");
  doc.setCreationDate(new Date(inhalt.erstelltAm));
  const s = new Schreiber(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));
  const unbekannt = tp.unbekannt;
  const betrag = (x: string | null) => (x === null ? unbekannt : f.betrag(dezimal(x)));
  const istProzent = (k: string) => k.trim().toUpperCase() === "LTV";
  const kennzahl = (k: string, x: string | null) => (x === null ? unbekannt : istProzent(k) ? f.prozent(alsDezimal(x), 2) : f.faktor(alsDezimal(x), 2));

  s.text(inhalt.mandant, { groesse: 9, farbe: GRAU });
  s.text(t.covenantNachweis.titel, { groesse: 18, fett: true });
  s.text(fuelle(tp.untertitel, { datum: f.datum(inhalt.stichtag) }), { groesse: 11, abstand: 8 });
  s.tabelle(
    [
      { titel: tp.kredit, breite: 3 },
      { titel: tp.bank, breite: 2 },
      { titel: tp.kreditnummer, breite: 1.5 },
      { titel: tp.gesellschaft, breite: 2.5 },
      { titel: tp.stichtag, breite: 1.2 },
    ],
    [[{ text: inhalt.kredit.bezeichnung }, { text: inhalt.kredit.bank ?? "–" }, { text: inhalt.kredit.kreditnummer ?? "–" }, { text: inhalt.kredit.gesellschaft }, { text: f.datum(inhalt.stichtag) }]],
  );
  const erstellt = f.datumZeit(new Date(inhalt.erstelltAm));
  s.text(inhalt.erstelltVon ? fuelle(tp.erstellt, { datum: erstellt, name: inhalt.erstelltVon }) : fuelle(tp.erstelltOhne, { datum: erstellt }), { groesse: 8.5, farbe: GRAU });

  const ergebnis = gesamtErgebnis(inhalt);
  s.y -= 6;
  s.text(`${tp.ergebnis}: ${t.covenantNachweis.ergebnis[ergebnis]}`, { groesse: 12, fett: true, farbe: ergebnis === "verletzt" ? ROT : ergebnis === "eingehalten" ? GRUEN : DUNKEL });

  s.ueberschrift(tp.covenants);
  s.tabelle(
    [
      { titel: tp.spalten.art, breite: 2.1 },
      { titel: tp.spalten.kennzahl, breite: 2.3 },
      { titel: tp.spalten.bedingung, breite: 1.8 },
      { titel: tp.spalten.ist, breite: 1.3, rechts: true },
      { titel: tp.spalten.puffer, breite: 1.3, rechts: true },
      { titel: tp.spalten.status, breite: 1.4 },
    ],
    inhalt.covenants.map((c) => {
      const status = c.eingehalten === null ? "offen" : c.eingehalten ? "eingehalten" : "verletzt";
      return [
        { text: t.kredite.folgen[c.folge] },
        { text: c.beschreibung ? `${c.kennzahl} – ${c.beschreibung}` : c.kennzahl },
        { text: c.vergleich && c.schwellenwert !== null ? `${t.vergleiche[c.vergleich]} ${kennzahl(c.kennzahl, c.schwellenwert)}` : "–" },
        { text: kennzahl(c.kennzahl, c.wert) },
        { text: c.abstand === null ? "–" : istProzent(c.kennzahl) ? `${f.zahl(alsDezimal(c.abstand), 2)} %-P.` : f.faktor(alsDezimal(c.abstand), 2) },
        { text: tp.status[status], fett: true, farbe: status === "verletzt" ? ROT : status === "eingehalten" ? GRUEN : DUNKEL },
      ];
    }),
  );

  s.ueberschrift(tp.herleitung);
  for (const formel of tp.formeln) s.text(`• ${formel}`, { groesse: 9 });
  s.y -= 4;
  s.tabelle(
    [
      { titel: tp.summen, breite: 3 },
      { titel: "", breite: 2, rechts: true },
    ],
    (Object.keys(tp.werte) as Array<keyof typeof tp.werte>).map((k) => [{ text: tp.werte[k] }, { text: betrag(inhalt.summen[k]) }]).concat([
      [{ text: "LTV" }, { text: kennzahl("LTV", inhalt.kennzahlen.LTV) }],
      [{ text: "DSCR" }, { text: kennzahl("DSCR", inhalt.kennzahlen.DSCR) }],
      [{ text: "ICR" }, { text: kennzahl("ICR", inhalt.kennzahlen.ICR) }],
    ]),
  );

  s.ueberschrift(tp.haeuser);
  s.tabelle(
    [
      { titel: tp.spaltenHaus.haus, breite: 3 },
      { titel: tp.spaltenHaus.verkehrswert, breite: 2, rechts: true },
      { titel: tp.spaltenHaus.stand, breite: 1.3 },
      { titel: tp.spaltenHaus.quelle, breite: 2.2 },
      { titel: tp.spaltenHaus.miete, breite: 2, rechts: true },
    ],
    inhalt.haeuser.map((h) => [
      { text: h.bezeichnung },
      { text: h.verkehrswert ? betrag(h.verkehrswert.wert) : unbekannt, farbe: h.verkehrswert ? undefined : ROT },
      { text: h.verkehrswert ? f.datum(h.verkehrswert.stichtag) : "–" },
      { text: h.verkehrswert?.quelle ?? "–" },
      { text: betrag(h.istJahr) },
    ]),
  );

  s.ueberschrift(tp.kredite);
  s.tabelle(
    [
      { titel: tp.spaltenKredit.kredit, breite: 2.8 },
      { titel: tp.spaltenKredit.anteil, breite: 2.2 },
      { titel: tp.spaltenKredit.restschuld, breite: 1.8, rechts: true },
      { titel: tp.spaltenKredit.beleg, breite: 2.2 },
      { titel: tp.spaltenKredit.kapitaldienst, breite: 2.2, rechts: true },
    ],
    inhalt.kredite.map((k) => {
      const anteil = k.anteile.reduce((sum, a) => sum.plus(dezimal(a.prozent)), dezimal(0)).dividedBy(100);
      const rest = k.restschuld;
      const kd = k.kapitaldienst;
      return [
        { text: k.eigener ? `${k.bezeichnung} ${tp.dieserKredit}` : k.bezeichnung, fett: k.eigener },
        { text: k.anteile.map((a) => fuelle(tp.anteilWert, { prozent: f.prozent(dezimal(a.prozent), 0), haus: a.haus })).join(", ") },
        { text: rest ? f.betrag(dezimal(rest.betrag).times(anteil)) : unbekannt, farbe: rest ? undefined : ROT },
        { text: rest ? (rest.herkunft === "nichtAusgezahlt" ? tp.nichtAusgezahlt : `${tp.herkunft[rest.herkunft]} ${f.datum(rest.stichtag)}${rest.quelle ? `, ${(t.saldoQuellen as Record<string, string>)[rest.quelle] ?? rest.quelle}` : ""}${rest.quelleText ? `: ${rest.quelleText}` : ""}`) : "–" },
        {
          text: kd
            ? `${f.betrag(dezimal(kd.zins).plus(dezimal(kd.tilgung)).times(anteil))}\n${kd.quelle === "buchungen" && kd.von && kd.bis ? fuelle(tp.kdBuchungen, { von: f.datum(kd.von), bis: f.datum(kd.bis) }) : tp.kdSchaetzung}`
            : unbekannt,
          farbe: kd ? undefined : ROT,
        },
      ];
    }),
  );

  s.ueberschrift(tp.luecken);
  if (inhalt.luecken.length === 0) s.text(tp.keineLuecken);
  for (const l of inhalt.luecken) s.text(`• ${fuelle(tp.lueckenText[l.art], { objekt: l.objekt })}`, { farbe: l.art === "geschaetzt" ? DUNKEL : ROT });
  s.y -= 8;
  s.text(tp.hinweis, { groesse: 8.5, farbe: GRAU });

  const font = await doc.embedFont(StandardFonts.Helvetica);
  s.seiten.forEach((p, i) => {
    const text = pdfText(`${t.covenantNachweis.titel} · ${inhalt.kredit.bezeichnung} · ${f.datum(inhalt.stichtag)}    ${fuelle(tp.seite, { seite: i + 1, seiten: s.seiten.length })}`);
    p.drawText(text, { x: RAND, y: RAND - 20, size: 7.5, font, color: GRAU });
  });
  return doc.save();
}
