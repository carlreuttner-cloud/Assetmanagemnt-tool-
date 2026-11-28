import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { berichtFilter } from "@/lib/daten/quartalsbericht";
import { formatierer } from "@/lib/format";
import { quartalsberichtPdf } from "@/lib/pdf/quartalsbericht";
import type { QuartalsberichtInhalt } from "@/lib/quartalsbericht";

/** Quartalsbericht als PDF aus dem eingefrorenen Inhalt (Investoren nur freigegebene Berichte). */
export async function GET(_anfrage: Request, { params }: RouteContext<"/api/quartalsbericht/[id]">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("berichte");
  const sicht = await sichtbarkeit(kontext);
  const b = await kontext.db.quartalsbericht.findFirst({ where: { id, ...berichtFilter(kontext.rolle, sicht.gesellschaftIds) }, select: { inhalt: true, status: true, kommentar: true, freigegebenVonName: true, freigegebenAm: true } });
  if (!b) return new Response(null, { status: 404 });
  const t = texte(kontext.mandant.sprache);
  const f = formatierer(kontext.mandant);
  const inhalt = b.inhalt as unknown as QuartalsberichtInhalt;
  const freigabe = b.freigegebenAm ? fuelle(t.quartalsbericht.freigegebenVon, { name: b.freigegebenVonName ?? "", datum: f.datumZeit(b.freigegebenAm) }) : null;
  const pdf = await quartalsberichtPdf(inhalt, { status: b.status, kommentar: b.kommentar, freigabe }, t, f);
  const name = fuelle(t.quartalsbericht.dateiname, { umfang: inhalt.umfang.name, quartal: inhalt.quartal, jahr: inhalt.jahr });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
