import { pruefeZugriff } from "@/lib/auth/kontext";
import { lese } from "@/lib/dateispeicher";

/** Liefert die Datei eines Posteingangs-Eintrags zur Ansicht aus (nur mit Schreibrecht auf Dokumente). */
export async function GET(_anfrage: Request, { params }: RouteContext<"/api/eingang/[id]">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("dokumente", "schreiben");
  const e = await kontext.db.eingang.findFirst({ where: { id }, select: { speicherPfad: true, mimeType: true, dateiname: true, status: true } });
  if (!e) return new Response(null, { status: 404 });
  const inhalt = await lese(e.speicherPfad).catch(() => null);
  if (!inhalt) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(inhalt), {
    headers: {
      "Content-Type": e.mimeType,
      "Content-Disposition": `${e.status === "QUARANTAENE" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(e.dateiname)}`,
      "Cache-Control": "private, max-age=600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
