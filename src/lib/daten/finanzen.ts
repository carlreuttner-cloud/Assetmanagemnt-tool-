import "server-only";
import type { Kontext } from "@/lib/auth/kontext";
import { isoDatum } from "@/lib/datum";
import { ALLE_POSTEN, type JahresDaten, type Posten } from "@/lib/finanzen";
import { dezimal } from "@/lib/geld";

/**
 * Geschäftsjahre einer Gesellschaft als Rechengrundlage. Die Sichtbarkeit der Gesellschaft
 * muss der Aufrufer vorher geprüft haben (sie wird über die Gesellschaft geladen).
 */
export async function ladeGeschaeftsjahre(kontext: Kontext, gesellschaftId: string) {
  const zeilen = await kontext.db.geschaeftsjahr.findMany({ where: { gesellschaftId }, orderBy: { jahr: "asc" } });
  return zeilen.map((z) => {
    const posten = Object.fromEntries(ALLE_POSTEN.map((p) => [p, z[p] === null ? null : dezimal(z[p])])) as Record<Posten, ReturnType<typeof dezimal> | null>;
    return {
      id: z.id,
      jahr: z.jahr,
      beginn: isoDatum(z.beginn),
      ende: isoDatum(z.ende),
      quelle: z.quelle,
      quelleText: z.quelleText,
      status: z.status,
      notiz: z.notiz,
      ...posten,
    } satisfies JahresDaten & { notiz: string | null };
  });
}

export type GeschaeftsjahrZeile = Awaited<ReturnType<typeof ladeGeschaeftsjahre>>[number];
