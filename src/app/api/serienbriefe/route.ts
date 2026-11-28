import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { heute } from "@/lib/datum";
import { istBereit, ladeEmpfaenger, leseSerie } from "@/lib/daten/serienbrief";
import { sichererName } from "@/lib/datenraum";
import { formatierer } from "@/lib/format";
import { serienbriefPdf } from "@/lib/pdf/serienbrief";

/** Vorschau-PDF aller bereiten Briefe einer Serie (nichts wird gespeichert). */
export async function GET(anfrage: Request) {
  const kontext = await pruefeZugriff("mieter");
  const t = texte(kontext.mandant.sprache);
  const ts = t.serienbriefe;
  const q = new URL(anfrage.url).searchParams;
  const { fehler, vorlage, parameter } = await leseSerie(kontext, { vorlage: q.get("vorlage"), haus: q.get("haus"), gesellschaft: q.get("gesellschaft"), prozent: q.get("prozent"), datum: q.get("datum") }, heute());
  if (fehler || !vorlage || !parameter) return new Response(ts.fehler[fehler ?? "vorlage"], { status: 400 });
  const f = formatierer(kontext.mandant);
  const nur = q.getAll("mv");
  const empfaenger = (await ladeEmpfaenger(kontext, { ...parameter, nur: nur.length ? nur : undefined }, f, ts.fehlt)).filter(istBereit);
  if (empfaenger.length === 0) return new Response(ts.keineBereit, { status: 404 });
  const daten = await serienbriefPdf(
    vorlage.name,
    empfaenger.map((e) => ({ absender: e.gesellschaft, anschrift: e.anschrift!, ort: null, datum: f.datum(parameter.datum), betreff: e.betreff, text: e.text })),
    { wasserzeichen: ts.vorschauWasserzeichen, fuss: (s, n) => fuelle(ts.pdfFussVorschau, { seite: s, seiten: n }) },
  );
  const datei = `${sichererName(`${ts.vorschau} ${vorlage.name}`)}.pdf`;
  return new Response(Buffer.from(daten), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${datei}"; filename*=UTF-8''${encodeURIComponent(datei)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
