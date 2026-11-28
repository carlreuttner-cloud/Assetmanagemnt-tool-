/**
 * Testdaten: ein Nachrangdarlehen (Mezzanine, Rang 1) und ein Gesellschafterdarlehen (Rang 2)
 * für die erste Gesellschaft mit Gesellschaftern, ohne Hauszuordnung (Darlehen der ganzen
 * Gesellschaft), endfällig, mit belegten Salden.
 */
import type { PrismaClient } from "../../src/generated/prisma/client";

const tag = (d: string) => new Date(`${d}T00:00:00Z`);

export async function baueNachrangdarlehen(db: PrismaClient, mandantId: string) {
  const g = await db.gesellschaft.findFirst({
    where: { mandantId, gesellschafter: { some: {} }, waterfallvertrag: { isNot: null } },
    orderBy: { name: "asc" },
    select: { id: true, gesellschafter: { orderBy: { name: "asc" }, select: { id: true, name: true } } },
  });
  if (!g) return;
  const geber = g.gesellschafter[g.gesellschafter.length - 1];
  const darlehen = [
    {
      bezeichnung: "Mezzanine-Darlehen (N01)", bank: "Demo Mezzanine Fonds", kreditart: "NACHRANGDARLEHEN" as const, rang: 1, gesellschafterId: null,
      ursprungsbetrag: "1500000", auszahlungsdatum: "2023-07-01", sollzins: "9", zinsbindungBis: "2028-06-30", laufzeitBis: "2028-06-30",
      saldo: { stichtag: "2026-10-31", betrag: "1500000.00", quelle: "KONTOAUSZUG" as const, quelleText: "Kontoauszug Oktober 2026" },
    },
    {
      bezeichnung: `Gesellschafterdarlehen ${geber.name} (N02)`, bank: geber.name, kreditart: "GESELLSCHAFTERDARLEHEN" as const, rang: 2, gesellschafterId: geber.id,
      ursprungsbetrag: "500000", auszahlungsdatum: "2022-01-15", sollzins: "5", zinsbindungBis: "2030-12-31", laufzeitBis: "2030-12-31",
      saldo: { stichtag: "2025-12-31", betrag: "500000.00", quelle: "JAHRESABSCHLUSS" as const, quelleText: "Jahresabschluss 2025, Verbindlichkeiten gegenüber Gesellschaftern (mit Rangrücktritt)" },
    },
  ];
  for (const d of darlehen) {
    const k = await db.kredit.create({
      data: {
        mandantId, gesellschaftId: g.id, bezeichnung: d.bezeichnung, bank: d.bank, kreditart: d.kreditart, rang: d.rang, gesellschafterId: d.gesellschafterId,
        ursprungsbetrag: d.ursprungsbetrag, auszahlungsdatum: tag(d.auszahlungsdatum), zinsArt: "FEST", sollzins: d.sollzins,
        zinsbindungBis: tag(d.zinsbindungBis), laufzeitBis: tag(d.laufzeitBis), zahlweise: "JAEHRLICH", tilgungsart: "ENDFAELLIG",
        sondertilgungRecht: "KEINES", notiz: "Testdaten: endfällig, Zinsen jährlich",
      },
    });
    await db.kreditsaldo.create({
      data: { mandantId, kreditId: k.id, stichtag: tag(d.saldo.stichtag), art: "DARLEHEN", betrag: d.saldo.betrag, quelle: d.saldo.quelle, quelleText: d.saldo.quelleText, status: "BELEGT" },
    });
  }
}
