/**
 * Testdaten Instandhaltungsplan: Bauteile für die ersten acht Häuser mit Zyklus, letzter Erneuerung
 * und geplanten Kosten. Einige Bauteile sind überfällig oder bald fällig, bei einigen fehlen Kosten
 * oder das Jahr der letzten Erneuerung (Datenlücken). Alle Werte sind erfunden (Testdaten).
 */
import type { PrismaClient } from "../../src/generated/prisma/client";

type Art = "DACH" | "FASSADE" | "FENSTER" | "HEIZUNG" | "AUFZUG" | "LEITUNGEN";
const VORLAGEN: Array<{ art: Art; bezeichnung: string; zyklus: number | null; alter: number | null; kosten: number | null }> = [
  { art: "DACH", bezeichnung: "Dacheindeckung", zyklus: 40, alter: 41, kosten: 180_000 },
  { art: "HEIZUNG", bezeichnung: "Heizkessel", zyklus: 20, alter: 18, kosten: 65_000 },
  { art: "FASSADE", bezeichnung: "Fassadenanstrich", zyklus: 15, alter: 9, kosten: 45_000 },
  { art: "FENSTER", bezeichnung: "Fenster Straßenseite", zyklus: 30, alter: 27, kosten: null },
  { art: "AUFZUG", bezeichnung: "Aufzugsanlage", zyklus: 25, alter: null, kosten: 120_000 },
  { art: "LEITUNGEN", bezeichnung: "Steigleitungen", zyklus: null, alter: 35, kosten: null },
];

export async function baueInstandhaltung(db: PrismaClient, mandantId: string, jahr = new Date().getUTCFullYear()) {
  const haeuser = await db.haus.findMany({ where: { mandantId }, orderBy: { bezeichnung: "asc" }, take: 8, select: { id: true } });
  for (const [i, h] of haeuser.entries()) {
    // Häuser unterscheiden sich: nicht jedes hat alle Bauteile, Alter leicht versetzt
    for (const [k, v] of VORLAGEN.entries()) {
      if ((i + k) % 4 === 3) continue;
      const kosten = v.kosten === null ? null : v.kosten + i * 5_000;
      await db.bauteil.create({
        data: {
          mandantId, hausId: h.id, art: v.art, bezeichnung: v.bezeichnung, zyklusJahre: v.zyklus,
          letzteErneuerung: v.alter === null ? null : jahr - v.alter + (i % 3),
          geplanteKosten: kosten === null ? null : kosten.toFixed(2),
          kostenQuelle: kosten === null ? null : k === 0 ? "Angebot Dachdecker (Testdaten)" : "Kostenschätzung Hausverwaltung (Testdaten)",
          kostenStand: kosten === null ? null : new Date(Date.UTC(jahr - 1, 9, 1)),
          erstelltVon: "Testdaten",
        },
      });
    }
  }
}
