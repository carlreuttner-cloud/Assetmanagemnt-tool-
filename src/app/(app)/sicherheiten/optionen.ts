import "server-only";
import type { Kontext } from "@/lib/auth/kontext";
import type { Sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { erlaubt } from "@/lib/daten/portfolio";

/** Auswahllisten für das Formular (nur sichtbare Objekte). */
export async function formularOptionen(kontext: Kontext, sicht: Sichtbarkeit) {
  const g = erlaubt(sicht.gesellschaftIds);
  const [haeuser, kredite, gesellschaften, dokumente] = await Promise.all([
    kontext.db.haus.findMany({ where: { gesellschaftId: g }, orderBy: { bezeichnung: "asc" }, select: { id: true, bezeichnung: true } }),
    kontext.db.kredit.findMany({ where: { gesellschaftId: g }, orderBy: { bezeichnung: "asc" }, select: { id: true, bezeichnung: true, bank: true } }),
    kontext.db.gesellschaft.findMany({ where: { id: g }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    kontext.db.dokument.findMany({ where: sicht.gesellschaftIds === "alle" ? {} : { gesellschaftId: { in: sicht.gesellschaftIds } }, orderBy: { erstelltAm: "desc" }, take: 200, select: { id: true, titel: true } }),
  ]);
  return { haeuser, kredite, gesellschaften, dokumente };
}
