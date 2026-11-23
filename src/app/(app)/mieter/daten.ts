import "server-only";
import type { Kontext } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { erlaubt } from "@/lib/daten/portfolio";

/** Auswahllisten für das Mietverhältnis-Formular (nur sichtbare Häuser). */
export async function formularListen(kontext: Kontext) {
  const sicht = await sichtbarkeit(kontext);
  const [einheiten, mieter] = await Promise.all([
    kontext.db.einheit.findMany({
      where: { hausId: erlaubt(sicht.hausIds) },
      orderBy: [{ haus: { bezeichnung: "asc" } }, { bezeichnung: "asc" }],
      select: { id: true, bezeichnung: true, haus: { select: { bezeichnung: true } } },
    }),
    kontext.db.mieter.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return {
    einheiten: einheiten.map((e) => ({ id: e.id, text: `${e.haus.bezeichnung} · ${e.bezeichnung}` })),
    mieter,
  };
}
