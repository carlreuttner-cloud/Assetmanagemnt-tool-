/**
 * PDF eines oder mehrerer Serienbriefe: je Brief eine neue Seite mit Absender, Anschrift, Datum,
 * Betreff und Text. Layout ist eigener Code (pdf-lib als Abhängigkeit).
 */
import "server-only";
import { A4, GRAU, RAND, fusszeilen, neuesPdf } from "./schreiber";

export interface BriefInhalt {
  absender: string;
  anschrift: string[];
  ort: string | null;
  datum: string;
  betreff: string;
  text: string;
}

export async function serienbriefPdf(titel: string, briefe: BriefInhalt[], o: { wasserzeichen?: string; fuss: (seite: number, seiten: number) => string }): Promise<Uint8Array> {
  const { doc, s, normal } = await neuesPdf(titel, new Date());
  briefe.forEach((b, i) => {
    if (i > 0) s.neueSeite();
    s.text(b.absender, { groesse: 7.5, farbe: GRAU, abstand: 10 });
    for (const z of b.anschrift) s.text(z, { groesse: 10.5, abstand: 0 });
    s.y = Math.min(s.y, A4.hoehe - RAND - 170);
    s.text(b.ort ? `${b.ort}, ${b.datum}` : b.datum, { abstand: 18 });
    s.text(b.betreff, { groesse: 11, fett: true, abstand: 14 });
    for (const absatz of b.text.split(/\n{2,}/)) s.text(absatz, { groesse: 10, abstand: 8 });
  });
  fusszeilen(s, normal, o.fuss, o.wasserzeichen);
  return doc.save();
}
