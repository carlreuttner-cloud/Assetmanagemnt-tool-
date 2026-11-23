import "server-only";
import type { Kontext } from "@/lib/auth/kontext";
import { isoDatum } from "@/lib/datum";
import { dezimal } from "@/lib/geld";
import type { BestandEinheit } from "@/lib/import/mieterliste";

/** Einheiten eines Hauses mit allen Mietverhältnissen, als Eingabe für den Mieterlisten-Abgleich. */
export async function ladeMieterBestand(db: Kontext["db"], hausId: string): Promise<BestandEinheit[]> {
  const einheiten = await db.einheit.findMany({
    where: { hausId },
    include: { mietverhaeltnisse: { include: { mieter: { select: { name: true } } }, orderBy: { beginn: "asc" } } },
  });
  return einheiten.map((e) => ({
    id: e.id,
    bezeichnung: e.bezeichnung,
    art: e.art,
    flaeche: dezimal(e.flaeche),
    erwarteteMiete: e.erwarteteMiete ? dezimal(e.erwarteteMiete) : null,
    mietverhaeltnisse: e.mietverhaeltnisse.map((m) => ({
      id: m.id,
      mieterId: m.mieterId,
      mieterName: m.mieter.name,
      beginn: isoDatum(m.beginn),
      ende: isoDatum(m.ende),
      sollMiete: dezimal(m.sollMiete),
      istMiete: dezimal(m.istMiete),
      rueckstand: dezimal(m.rueckstand),
      rueckstandStichtag: isoDatum(m.rueckstandStichtag),
      letzteMieterhoehung: isoDatum(m.letzteMieterhoehung),
    })),
  }));
}
