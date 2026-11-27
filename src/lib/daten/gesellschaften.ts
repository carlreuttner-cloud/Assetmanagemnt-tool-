import "server-only";
import type { Kontext } from "@/lib/auth/kontext";
import { idFilter } from "@/lib/auth/sichtbarkeit";
import { heute } from "@/lib/datum";
import { gruppenKennzahlen, type Kennzahlen } from "@/lib/kennzahlen";
import type { GesellschaftsZeile } from "@/components/gesellschaften-tabelle";
import { ladeRechengrundlage } from "./portfolio";

export type PortfolioGruppe = {
  /** null = "Ohne Portfolio" */
  portfolio: { id: string; name: string; beschreibung: string | null } | null;
  zeilen: GesellschaftsZeile[];
  summe: Kennzahlen;
};

/**
 * Gesellschaften mit Häusern und Kennzahlen, gruppiert nach Portfolio (Portfolios alphabetisch,
 * "Ohne Portfolio" zuletzt). Mit `bereich: true` nur die Portfolio-Auswahl, sonst alles Sichtbare.
 * Leere Portfolios erscheinen mit, damit man ihnen Gesellschaften zuordnen kann.
 */
export async function ladePortfolioGruppen(kontext: Kontext, optionen: { bereich?: boolean } = {}) {
  const stichtag = heute();
  const { haeuser, kredite, referenzwerte, sicht } = await ladeRechengrundlage(kontext, { bereich: optionen.bereich });
  const [gesellschaften, portfolios] = await Promise.all([
    kontext.db.gesellschaft.findMany({
      where: { id: idFilter(sicht.gesellschaftIds) },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        rechtsform: true,
        portfolioId: true,
        haeuser: { orderBy: { bezeichnung: "asc" }, select: { id: true, bezeichnung: true, ort: true } },
      },
    }),
    kontext.db.portfolio.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, beschreibung: true } }),
  ]);
  const sichtbareHaeuser = new Set(haeuser.map((h) => h.id));
  const zeile = (g: (typeof gesellschaften)[number]): GesellschaftsZeile => {
    const eigeneKredite = kredite.filter((k) => k.gesellschaftId === g.id);
    return {
      id: g.id,
      name: g.name,
      rechtsform: g.rechtsform,
      haeuser: g.haeuser.filter((h) => sichtbareHaeuser.has(h.id)),
      kredite: eigeneKredite.length,
      k: gruppenKennzahlen(haeuser.filter((h) => h.gesellschaftId === g.id), eigeneKredite, referenzwerte, stichtag),
    };
  };
  const gruppe = (portfolio: PortfolioGruppe["portfolio"]): PortfolioGruppe => {
    const eigene = gesellschaften.filter((g) => g.portfolioId === (portfolio?.id ?? null));
    const ids = new Set(eigene.map((g) => g.id));
    return {
      portfolio,
      zeilen: eigene.map(zeile),
      summe: gruppenKennzahlen(haeuser.filter((h) => ids.has(h.gesellschaftId)), kredite.filter((k) => ids.has(k.gesellschaftId)), referenzwerte, stichtag),
    };
  };
  const gruppen = [...portfolios.map((p) => gruppe(p)), gruppe(null)];
  return {
    stichtag,
    gruppen,
    gesamt: gruppenKennzahlen(haeuser, kredite, referenzwerte, stichtag),
    anzahl: gesellschaften.length,
    gesamtZeilen: gesellschaften.map(zeile),
  };
}
