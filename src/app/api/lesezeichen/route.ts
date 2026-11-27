import { pruefeZugriff } from "@/lib/auth/kontext";
import { ladeLesezeichen } from "@/lib/daten/lesezeichen";

/** Favoriten und zuletzt angesehene Seiten des angemeldeten Benutzers für die Seitenleiste. */
export async function GET() {
  const kontext = await pruefeZugriff("suche");
  return Response.json(await ladeLesezeichen(kontext), { headers: { "Cache-Control": "private, no-store" } });
}
