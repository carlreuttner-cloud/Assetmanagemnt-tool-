import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { heute } from "@/lib/datum";
import { erlaubt } from "@/lib/daten/portfolio";
import { ladeMieterBestand } from "@/lib/daten/import";
import { schreibeMieterliste } from "@/lib/import/mieterliste";

/** Aktuelle Mieterliste eines Hauses als CSV-Vorlage für den Import (?haus=<id>). */
export async function GET(anfrage: Request) {
  const kontext = await pruefeZugriff("import");
  const hausId = new URL(anfrage.url).searchParams.get("haus") ?? "";
  const sicht = await sichtbarkeit(kontext);
  const haus = await kontext.db.haus.findFirst({ where: { id: erlaubt(sicht.hausIds, hausId) }, select: { id: true, bezeichnung: true } });
  if (!haus || haus.id !== hausId) return new Response(null, { status: 404 });
  const stand = heute();
  const csv = schreibeMieterliste(await ladeMieterBestand(kontext.db, haus.id), stand);
  const name = `Mieterliste ${haus.bezeichnung} ${stand}.csv`.replace(/[^\p{L}\p{N} ._-]/gu, "");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mieterliste.csv"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
