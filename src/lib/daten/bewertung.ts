import "server-only";
import type { Kontext } from "@/lib/auth/kontext";
import { bereichsSicht } from "@/lib/auth/auswahl";
import { idFilter } from "@/lib/auth/sichtbarkeit";
import type { BewertungsHaus } from "@/lib/bewertung";
import { isoDatum } from "@/lib/datum";
import { dezimal } from "@/lib/geld";

export type BewertungsHausZeile = BewertungsHaus & {
  bezeichnung: string;
  ort: string | null;
  gesellschaft: { id: string; name: string; portfolioId: string | null };
};

/** Häuser der Portfolio-Auswahl mit allen Gutachten und den Marktwerten ohne Gutachten. */
export async function ladeBewertung(kontext: Kontext) {
  const sicht = await bereichsSicht(kontext);
  const [haeuser, portfolios] = await Promise.all([
    kontext.db.haus.findMany({
      where: { id: idFilter(sicht.hausIds), gesellschaftId: idFilter(sicht.gesellschaftIds) },
      orderBy: [{ gesellschaft: { name: "asc" } }, { bezeichnung: "asc" }],
      select: {
        id: true,
        bezeichnung: true,
        ort: true,
        kaufdatum: true,
        gesellschaft: { select: { id: true, name: true, portfolioId: true } },
        gutachten: { select: { id: true, stichtag: true, verkehrswert: true, bodenwert: true, gebaeudewert: true, gutachter: true } },
        verkehrswerte: { where: { gutachten: null }, select: { id: true, stichtag: true, wert: true, quelle: true } },
      },
    }),
    kontext.db.portfolio.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const zeilen: BewertungsHausZeile[] = haeuser.map((h) => ({
    hausId: h.id,
    bezeichnung: h.bezeichnung,
    ort: h.ort,
    kaufdatum: isoDatum(h.kaufdatum),
    gesellschaft: h.gesellschaft,
    gutachten: h.gutachten.map((g) => ({
      id: g.id,
      hausId: h.id,
      stichtag: isoDatum(g.stichtag),
      verkehrswert: dezimal(g.verkehrswert),
      bodenwert: g.bodenwert === null ? null : dezimal(g.bodenwert),
      gebaeudewert: g.gebaeudewert === null ? null : dezimal(g.gebaeudewert),
      gutachter: g.gutachter,
    })),
    marktwerte: h.verkehrswerte.map((v) => ({ id: v.id, hausId: h.id, stichtag: isoDatum(v.stichtag), wert: dezimal(v.wert), quelle: v.quelle })),
  }));
  return { haeuser: zeilen, portfolios, auswahl: sicht.auswahl };
}
