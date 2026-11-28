/** PDF eines Quartalsberichts aus dem eingefrorenen Inhalt; Entwürfe tragen ein Wasserzeichen. */
import "server-only";
import { fuelle, type Texte } from "@/i18n";
import type { Formatierer } from "@/lib/format";
import type { QuartalsberichtInhalt } from "@/lib/quartalsbericht";
import { berichtAbschnitte, type Ton } from "@/lib/quartalsbericht-ansicht";
import { DUNKEL, GRAU, GRUEN, ROT, fusszeilen, neuesPdf } from "./schreiber";
import { rgb } from "pdf-lib";

const FARBE: Record<Ton, ReturnType<typeof rgb>> = { gut: GRUEN, schlecht: ROT, warnung: rgb(0.6, 0.4, 0) };

export async function quartalsberichtPdf(
  b: QuartalsberichtInhalt,
  meta: { status: "ENTWURF" | "FREIGEGEBEN" | "VERWORFEN"; kommentar: string | null; freigabe: string | null },
  t: Texte,
  f: Formatierer,
): Promise<Uint8Array> {
  const tq = t.quartalsbericht;
  const titel = `${tq.titel} ${fuelle(tq.quartalWert, { quartal: b.quartal, jahr: b.jahr })}`;
  const { doc, s, normal } = await neuesPdf(`${titel} ${b.umfang.name}`, new Date(b.erstelltAm));
  s.text(b.mandant, { groesse: 9, farbe: GRAU });
  s.text(titel, { groesse: 18, fett: true });
  s.text(`${b.umfang.name} · ${tq.spaltenHaus.stand} ${f.datum(b.stichtag)}`, { groesse: 11, abstand: 4 });
  s.text(fuelle(tq.erstelltVon, { name: b.erstelltVon, datum: f.datumZeit(new Date(b.erstelltAm)) }), { groesse: 8.5, farbe: GRAU });
  s.text(meta.status === "FREIGEGEBEN" && meta.freigabe ? meta.freigabe : meta.status === "ENTWURF" ? tq.entwurfHinweis : tq.stati.VERWORFEN, {
    groesse: 9,
    fett: true,
    farbe: meta.status === "FREIGEGEBEN" ? GRUEN : ROT,
    abstand: 6,
  });
  for (const a of berichtAbschnitte(b, t, f, meta.kommentar)) {
    s.ueberschrift(a.titel);
    if (a.spalten && a.zeilen) s.tabelle(a.spalten, a.zeilen.map((z) => z.map((c) => ({ text: c.text, fett: c.fett, farbe: c.ton ? FARBE[c.ton] : DUNKEL }))));
    for (const x of a.texte ?? []) s.text(x.text, { farbe: x.ton ? FARBE[x.ton] : DUNKEL });
  }
  fusszeilen(s, normal, (seite, seiten) => `${titel} · ${b.umfang.name}    ${fuelle(tq.seite, { seite, seiten })}`, meta.status === "FREIGEGEBEN" ? undefined : tq.entwurfWasserzeichen);
  return doc.save();
}
