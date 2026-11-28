/**
 * Testdaten Investorenportal: Der Test-Investor (Ines Investor) bekommt Zugang zum Kapitalkonto der
 * „Investorengruppe Linde“ in der Lindenhof-Gesellschaft; zwei Lindenhof-Dokumente sind für Investoren
 * freigegeben.
 */
import type { PrismaClient } from "../../src/generated/prisma/client";

export async function bauePortal(db: PrismaClient, mandantId: string, investorMitgliedschaftId: string) {
  await db.gesellschafter.updateMany({ where: { mandantId, name: { startsWith: "Investorengruppe Linde" } }, data: { mitgliedschaftId: investorMitgliedschaftId } });
  const g = await db.gesellschaft.findFirst({ where: { mandantId, name: { startsWith: "Lindenhof" } }, select: { id: true } });
  if (!g) return;
  await db.dokument.updateMany({
    where: { mandantId, gesellschaftId: g.id, bestaetigt: true, kategorie: { in: ["Jahresabschluss", "Gesellschaftsvertrag"] } },
    data: { investorFreigabeAm: new Date("2026-11-20T10:00:00Z"), investorFreigabeVon: "Testdaten" },
  });
}
