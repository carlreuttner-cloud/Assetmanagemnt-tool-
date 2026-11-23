import "server-only";
import type { Kontext } from "./kontext";

/**
 * Welchen Ausschnitt des Mandanten der Benutzer sehen darf.
 * `"alle"` heißt: keine Einschränkung innerhalb des Mandanten.
 *
 * Fachseiten müssen diese Listen beim Laden von Gesellschaften, Häusern,
 * Krediten und Mietern als Filter verwenden.
 */
export type Sichtbarkeit = {
  gesellschaftIds: string[] | "alle";
  hausIds: string[] | "alle";
};

export async function sichtbarkeit(kontext: Kontext): Promise<Sichtbarkeit> {
  const { db, rolle, mitgliedschaftId } = kontext;

  if (rolle === "INVESTOR") {
    const zuweisungen = await db.gesellschaftZuweisung.findMany({
      where: { mitgliedschaftId },
      select: { gesellschaftId: true },
    });
    const gesellschaftIds = zuweisungen.map((z) => z.gesellschaftId);
    const haeuser = await db.haus.findMany({
      where: { gesellschaftId: { in: gesellschaftIds } },
      select: { id: true },
    });
    return { gesellschaftIds, hausIds: haeuser.map((h) => h.id) };
  }

  if (rolle === "HAUSVERWALTUNG") {
    const zuweisungen = await db.hausZuweisung.findMany({
      where: { mitgliedschaftId },
      select: { hausId: true },
    });
    return { gesellschaftIds: [], hausIds: zuweisungen.map((z) => z.hausId) };
  }

  return { gesellschaftIds: "alle", hausIds: "alle" };
}

/** Hilfsfunktion für Prisma-Bedingungen: `where: { id: idFilter(s.hausIds) }` */
export function idFilter(ids: string[] | "alle") {
  return ids === "alle" ? undefined : { in: ids };
}
