import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { suche } from "@/lib/daten/suche";
import { suchbegriff } from "@/lib/suche";

/** Vorschläge für das Suchfeld in der Seitenleiste (wenige Treffer je Art). */
export async function GET(anfrage: Request) {
  const kontext = await pruefeZugriff("suche");
  const s = suchbegriff(new URL(anfrage.url).searchParams.get("q"));
  if (!s) return Response.json({ gruppen: [] });
  const t = texte(kontext.mandant.sprache);
  const gruppen = await suche(kontext, s, t, 3);
  return Response.json({ gruppen }, { headers: { "Cache-Control": "private, no-store" } });
}
