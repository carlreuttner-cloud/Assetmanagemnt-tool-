/**
 * Testdaten Energie/ESG: Energieausweise für die meisten Häuser (einer abgelaufen, einer läuft bald ab,
 * drei Häuser ohne Ausweis) und Verbräuche 2023–2025 für einige Häuser, teils mit CO₂ laut Abrechnung.
 * Alle Werte sind erfunden und als Testdaten gekennzeichnet.
 */
import type { PrismaClient } from "../../src/generated/prisma/client";

const KLASSEN = ["B", "C", "D", "C", "E", "D", "F", "C", "B", "D", "E", "G"];
/** Kennwert passend zur Klasse (Mitte der Klassengrenzen für Wohngebäude) */
const KENNWERT: Record<string, number> = { B: 62, C: 87, D: 115, E: 145, F: 180, G: 225 };
const tag = (d: string) => new Date(`${d}T00:00:00Z`);

export async function baueEnergie(db: PrismaClient, mandantId: string) {
  const haeuser = await db.haus.findMany({ where: { mandantId }, orderBy: { bezeichnung: "asc" }, select: { id: true, einheiten: { where: { art: { not: "STELLPLATZ" } }, select: { flaeche: true } } } });
  for (const [i, h] of haeuser.entries()) {
    if (i >= KLASSEN.length) break; // die letzten Häuser bleiben ohne Ausweis
    const ausgestellt = i === 3 ? "2016-03-01" : i === 5 ? "2017-01-15" : `20${18 + (i % 7)}-0${(i % 9) + 1}-01`;
    const gueltig = i === 3 ? "2026-03-01" : i === 5 ? "2027-01-15" : `20${28 + (i % 7)}-0${(i % 9) + 1}-01`;
    const endenergie = KENNWERT[KLASSEN[i]] + (i % 3) * 2;
    await db.energieausweis.create({
      data: {
        mandantId, hausId: h.id, art: i % 3 === 0 ? "BEDARF" : "VERBRAUCH", energieklasse: KLASSEN[i], endenergie: endenergie.toFixed(2), primaerenergie: (endenergie * 1.1).toFixed(2),
        energietraeger: i % 4 === 0 ? "Fernwärme" : "Erdgas", ausgestelltAm: tag(ausgestellt), gueltigBis: tag(gueltig), registriernummer: `TEST-${2024 + (i % 2)}-${1000 + i}`,
        quelle: "Energieausweis (Testdaten)", erstelltVon: "Testdaten",
      },
    });
    if (i >= 6) continue;
    const flaeche = h.einheiten.reduce((s, e) => s + Number(e.flaeche), 0);
    for (const [k, jahr] of [2023, 2024, 2025].entries()) {
      const waerme = Math.round(flaeche * (endenergie + 10 - k * 4));
      await db.energieverbrauch.create({
        data: {
          mandantId, hausId: h.id, jahr, medium: "WAERME", menge: waerme.toFixed(2), kosten: (waerme * 0.12).toFixed(2),
          co2Kg: i < 4 ? (waerme * 0.201).toFixed(2) : null, energietraeger: i % 4 === 0 ? "Fernwärme" : "Erdgas", quelle: `Heizkostenabrechnung ${jahr} (Testdaten)`,
        },
      });
      if (i < 2) {
        await db.energieverbrauch.create({ data: { mandantId, hausId: h.id, jahr, medium: "STROM", menge: Math.round(flaeche * 3.2).toFixed(2), kosten: Math.round(flaeche * 3.2 * 0.31).toFixed(2), quelle: `Stromrechnung Allgemeinstrom ${jahr} (Testdaten)` } });
      }
    }
  }
}
