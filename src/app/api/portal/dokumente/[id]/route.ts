import { pruefeZugriff } from "@/lib/auth/kontext";
import { lese } from "@/lib/dateispeicher";
import { portalDokument } from "@/lib/daten/portal";

/** Für Investoren freigegebenes Dokument aus dem Portal (bei Vorschau: ?als=<Mitgliedschaft>). */
export async function GET(anfrage: Request, { params }: RouteContext<"/api/portal/dokumente/[id]">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("investorenportal");
  const d = await portalDokument(kontext, id, new URL(anfrage.url).searchParams.get("als") ?? undefined);
  if (!d) return new Response(null, { status: 404 });
  const inhalt = await lese(d.speicherPfad).catch(() => null);
  if (!inhalt) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(inhalt), {
    headers: {
      "Content-Type": d.mimeType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(d.dateiname)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
