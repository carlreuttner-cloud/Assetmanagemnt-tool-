import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { lese } from "@/lib/dateispeicher";
import { erlaubt } from "@/lib/daten/portfolio";

/** Liefert ein Hausfoto aus, nur innerhalb des Mandanten und der sichtbaren Häuser. */
export async function GET(_anfrage: Request, { params }: RouteContext<"/api/fotos/[id]">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("haeuser");
  const sicht = await sichtbarkeit(kontext);
  const foto = await kontext.db.foto.findFirst({ where: { id, hausId: erlaubt(sicht.hausIds) } });
  if (!foto) return new Response(null, { status: 404 });
  const inhalt = await lese(foto.speicherPfad).catch(() => null);
  if (!inhalt) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(inhalt), {
    headers: {
      "Content-Type": foto.mimeType,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
