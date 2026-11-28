/**
 * Testdaten: zwei Kapitalabrufe. Lindenhof: Abruf vom Oktober, ein Gesellschafter hat gezahlt, der
 * andere nicht (überfällig). Elbufer: Abruf mit Fälligkeit im nächsten Monat, noch ohne Eingang.
 */
import type { PrismaClient } from "../../src/generated/prisma/client";
import { aufteilen } from "../../src/lib/kapitalabruf";
import { dezimal } from "../../src/lib/geld";

const tag = (d: string) => new Date(`${d}T00:00:00Z`);

export async function baueKapitalabrufe(db: PrismaClient, mandantId: string) {
  const abrufe = [
    { name: "Lindenhof", bezeichnung: "Abruf Fassadensanierung 2026", abrufAm: "2026-10-01", faelligAm: "2026-10-31", gesamt: "250000", bezahlt: 1 },
    { name: "Elbufer", bezeichnung: "Abruf Heizungstausch 2027", abrufAm: "2026-11-15", faelligAm: "2026-12-31", gesamt: "400000", bezahlt: 0 },
  ];
  for (const a of abrufe) {
    const g = await db.gesellschaft.findFirst({
      where: { mandantId, name: { startsWith: a.name } },
      select: { id: true, gesellschafter: { orderBy: { name: "asc" }, select: { id: true, name: true, beteiligungProzent: true } } },
    });
    if (!g) continue;
    const teile = aufteilen(dezimal(a.gesamt), g.gesellschafter.map((x) => ({ id: x.id, name: x.name, beteiligungProzent: x.beteiligungProzent === null ? null : dezimal(x.beteiligungProzent) })));
    if (!teile.ok) continue;
    const abruf = await db.kapitalabruf.create({
      data: { mandantId, gesellschaftId: g.id, bezeichnung: a.bezeichnung, abrufAm: tag(a.abrufAm), faelligAm: tag(a.faelligAm), gesamtbetrag: a.gesamt, erstelltVon: "Testdaten" },
    });
    for (const [i, p] of teile.positionen.entries()) {
      const pos = await db.kapitalabrufPosition.create({ data: { mandantId, abrufId: abruf.id, gesellschafterId: p.gesellschafterId, anteilProzent: p.anteilProzent.toFixed(6), betrag: p.betrag.toFixed(2) } });
      if (i < a.bezahlt) {
        await db.kapitalbewegung.create({
          data: { mandantId, gesellschafterId: p.gesellschafterId, abrufPositionId: pos.id, art: "EINLAGE", datum: tag("2026-10-28"), betrag: p.betrag.toFixed(2), quelle: `Kapitalabruf ${a.bezeichnung} (Kontoauszug)` },
        });
      }
    }
  }
}
