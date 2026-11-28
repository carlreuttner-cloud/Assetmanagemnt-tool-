import { texte, fuelle } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import type { NachweisInhalt } from "@/lib/covenant-nachweis";
import { erlaubt } from "@/lib/daten/portfolio";
import { formatierer } from "@/lib/format";
import { covenantNachweisPdf } from "@/lib/pdf/covenant-nachweis";

/** Liefert einen gespeicherten Covenant-Nachweis als PDF, erzeugt aus dem eingefrorenen Inhalt. */
export async function GET(_anfrage: Request, { params }: RouteContext<"/api/covenant-nachweis/[id]">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("gesellschaften");
  const sicht = await sichtbarkeit(kontext);
  const n = await kontext.db.covenantNachweis.findFirst({ where: { id, kredit: { gesellschaftId: erlaubt(sicht.gesellschaftIds) } }, select: { inhalt: true } });
  if (!n) return new Response(null, { status: 404 });
  const t = texte(kontext.mandant.sprache);
  const f = formatierer(kontext.mandant);
  const inhalt = n.inhalt as unknown as NachweisInhalt;
  const pdf = await covenantNachweisPdf(inhalt, t, f);
  const name = fuelle(t.covenantNachweis.pdf.dateiname, { kredit: inhalt.kredit.bezeichnung, datum: inhalt.stichtag });
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
