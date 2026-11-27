import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { lese } from "@/lib/dateispeicher";
import { dokumentFilter } from "@/lib/daten/dateien";

/** Liefert eine Dokumentdatei zur Ansicht im Browser aus, nur innerhalb des Mandanten und der Sichtbarkeit. */
export async function GET(_anfrage: Request, { params }: RouteContext<"/api/dokumente/[id]">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("dokumente");
  const d = await kontext.db.dokument.findFirst({ where: { id, ...dokumentFilter(await sichtbarkeit(kontext)) } });
  if (!d) return new Response(null, { status: 404 });
  const inhalt = await lese(d.speicherPfad).catch(() => null);
  if (!inhalt) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(inhalt), {
    headers: {
      "Content-Type": d.mimeType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(d.dateiname)}`,
      "Cache-Control": "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
