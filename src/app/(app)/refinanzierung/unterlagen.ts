import type { Checkliste } from "@/lib/daten/dokumente";
import { zaehleStatus } from "@/lib/dokumente";
import type { HausDaten } from "@/lib/kennzahlen";
import type { KreditDaten } from "@/lib/kredit";

/**
 * Unterlagen für die Refinanzierung eines Kredits: die Zeilen der Dokument-Checkliste für den
 * Kredit selbst, seine Gesellschaft und alle Häuser, die er belastet.
 */
export function unterlagenStand(checkliste: Checkliste, kredit: KreditDaten, haeuser: HausDaten[]) {
  const hausIds = new Set(kredit.haeuser.map((h) => h.hausId));
  const zeilen = checkliste.zeilen.filter(
    (z) =>
      (z.objekt.bezug === "KREDIT" && z.objekt.id === kredit.id) ||
      (z.objekt.bezug === "GESELLSCHAFT" && z.objekt.id === kredit.gesellschaftId) ||
      (z.objekt.bezug === "HAUS" && hausIds.has(z.objekt.id) && haeuser.some((h) => h.id === z.objekt.id)),
  );
  const reihenfolge = { KREDIT: 0, GESELLSCHAFT: 1, HAUS: 2 } as const;
  zeilen.sort((a, b) => reihenfolge[a.objekt.bezug] - reihenfolge[b.objekt.bezug] || a.objekt.name.localeCompare(b.objekt.name, "de"));
  return { zeilen, zaehlung: zaehleStatus(zeilen.flatMap((z) => z.zellen.map((c) => c.bewertung.status))) };
}
