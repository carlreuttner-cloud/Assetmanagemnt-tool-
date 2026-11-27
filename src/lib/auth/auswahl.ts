import "server-only";
import { cookies } from "next/headers";
import type { Kontext } from "./kontext";
import { sichtbarkeit, type Sichtbarkeit } from "./sichtbarkeit";

/** Cookie mit der Portfolio-Auswahl, Wert "<mandantId>|<auswahl>". */
export const PORTFOLIO_COOKIE = "portfolio";

/** Generalübersicht (alles), ein Portfolio oder die Gesellschaften ohne Portfolio. */
export type Auswahl = { art: "alle" } | { art: "portfolio"; id: string; name: string } | { art: "ohne" };

export const AUSWAHL_OHNE = "ohne";

/** Liest die Portfolio-Auswahl des Benutzers für den aktiven Mandanten; ungültige Werte gelten als Generalübersicht. */
export async function ladeAuswahl(kontext: Kontext): Promise<Auswahl> {
  const roh = (await cookies()).get(PORTFOLIO_COOKIE)?.value ?? "";
  const [mandantId, wert] = roh.split("|");
  if (mandantId !== kontext.mandant.id || !wert) return { art: "alle" };
  if (wert === AUSWAHL_OHNE) return { art: "ohne" };
  const p = await kontext.db.portfolio.findFirst({ where: { id: wert }, select: { id: true, name: true } });
  return p ? { art: "portfolio", id: p.id, name: p.name } : { art: "alle" };
}

/**
 * Sichtbarkeit eingeschränkt auf die Portfolio-Auswahl. Für Übersichten und Listen;
 * Detailseiten und Aktionen prüfen nur die Rechte (`sichtbarkeit`), damit Links aus
 * Suche und Favoriten auch außerhalb der Auswahl funktionieren.
 */
export async function bereichsSicht(kontext: Kontext): Promise<Sichtbarkeit & { auswahl: Auswahl }> {
  const [sicht, auswahl] = await Promise.all([sichtbarkeit(kontext), ladeAuswahl(kontext)]);
  if (auswahl.art === "alle" || kontext.rolle === "HAUSVERWALTUNG") return { ...sicht, auswahl };
  const gesellschaften = await kontext.db.gesellschaft.findMany({
    where: { portfolioId: auswahl.art === "portfolio" ? auswahl.id : null },
    select: { id: true, haeuser: { select: { id: true } } },
  });
  const erlaubtG = (id: string) => sicht.gesellschaftIds === "alle" || sicht.gesellschaftIds.includes(id);
  const sichtbar = gesellschaften.filter((g) => erlaubtG(g.id));
  const hausIds = sichtbar.flatMap((g) => g.haeuser.map((h) => h.id)).filter((id) => sicht.hausIds === "alle" || sicht.hausIds.includes(id));
  return { gesellschaftIds: sichtbar.map((g) => g.id), hausIds, auswahl };
}
