import "server-only";
import type { Kontext } from "@/lib/auth/kontext";
import type { Sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { isoDatum } from "@/lib/datum";
import { dezimal } from "@/lib/geld";
import type { SicherheitDaten } from "@/lib/sicherheit";

/** Eingeschränkte Rollen sehen Sicherheiten ihrer Gesellschaften, Häuser oder Kredite. */
export function sicherheitFilter(sicht: Sichtbarkeit) {
  if (sicht.gesellschaftIds === "alle") return {};
  return {
    OR: [
      { gesellschaftId: { in: sicht.gesellschaftIds } },
      { haeuser: { some: { hausId: { in: sicht.hausIds === "alle" ? [] : sicht.hausIds } } } },
      { kredite: { some: { kredit: { gesellschaftId: { in: sicht.gesellschaftIds } } } } },
    ],
  };
}

export async function ladeSicherheiten(kontext: Kontext, sicht: Sichtbarkeit) {
  const zeilen = await kontext.db.sicherheit.findMany({
    where: sicherheitFilter(sicht),
    orderBy: [{ rang: { sort: "asc", nulls: "last" } }, { eingetragenAm: { sort: "asc", nulls: "last" } }],
    include: {
      haeuser: { select: { hausId: true, haus: { select: { id: true, bezeichnung: true } } } },
      kredite: { select: { kreditId: true, kredit: { select: { id: true, bezeichnung: true } } } },
      gesellschaft: { select: { id: true, name: true } },
      dokument: { select: { id: true, titel: true } },
    },
  });
  const daten: SicherheitDaten[] = zeilen.map((s) => ({
    id: s.id,
    art: s.art,
    betrag: s.betrag === null ? null : dezimal(s.betrag),
    eingetragenAm: isoDatum(s.eingetragenAm),
    gueltigBis: isoDatum(s.gueltigBis),
    geloeschtAm: isoDatum(s.geloeschtAm),
    hausIds: s.haeuser.map((h) => h.hausId),
    kreditIds: s.kredite.map((k) => k.kreditId),
  }));
  return { zeilen, daten };
}
