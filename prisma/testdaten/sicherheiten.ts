/**
 * Test-Sicherheiten (TESTDATEN): je Kredit eine erstrangige Grundschuld über den Ursprungsbetrag
 * auf seinen Häusern (bei K04 als Gesamtgrundschuld), dazu eine Bürgschaft, eine Mietabtretung und
 * eine gelöschte Altgrundschuld.
 */
import type { PrismaClient } from "../../src/generated/prisma/client";

export async function baueSicherheiten(db: PrismaClient, mandantId: string) {
  const kredite = await db.kredit.findMany({
    where: { mandantId },
    orderBy: { bezeichnung: "asc" },
    select: { id: true, bezeichnung: true, bank: true, ursprungsbetrag: true, gesellschaftId: true, auszahlungsdatum: true, haeuser: { select: { hausId: true } } },
  });
  let anzahl = 0;
  const rangJeHaus = new Map<string, number>();
  for (const k of kredite) {
    if (k.haeuser.length === 0) continue;
    const rang = Math.max(...k.haeuser.map((h) => (rangJeHaus.get(h.hausId) ?? 0) + 1));
    for (const h of k.haeuser) rangJeHaus.set(h.hausId, rang);
    await db.sicherheit.create({
      data: {
        mandantId,
        art: "GRUNDSCHULD",
        glaeubiger: k.bank ?? "Bank",
        betrag: k.ursprungsbetrag,
        rang,
        fundstelle: `Grundbuch (TESTDATEN), Abt. III lfd. Nr. ${rang}`,
        eingetragenAm: k.auszahlungsdatum,
        quelle: "GRUNDBUCHAUSZUG",
        stand: new Date("2026-03-31"),
        haeuser: { create: k.haeuser.map((h) => ({ mandantId, hausId: h.hausId })) },
        kredite: { create: [{ mandantId, kreditId: k.id }] },
      },
    });
    anzahl++;
  }
  const erster = kredite.find((k) => k.haeuser.length > 0);
  if (erster) {
    await db.sicherheit.create({
      data: { mandantId, art: "ABTRETUNG_MIETEN", glaeubiger: erster.bank ?? "Bank", quelle: "SICHERUNGSVERTRAG", stand: new Date("2026-03-31"), haeuser: { create: erster.haeuser.map((h) => ({ mandantId, hausId: h.hausId })) }, kredite: { create: [{ mandantId, kreditId: erster.id }] } },
    });
    await db.sicherheit.create({
      data: { mandantId, art: "BUERGSCHAFT", glaeubiger: erster.bank ?? "Bank", betrag: "250000", sicherungsgeber: "Gesellschafter (TESTDATEN)", gesellschaftId: erster.gesellschaftId, quelle: "SICHERUNGSVERTRAG", stand: new Date("2026-03-31"), kredite: { create: [{ mandantId, kreditId: erster.id }] } },
    });
    await db.sicherheit.create({
      data: { mandantId, art: "GRUNDSCHULD", glaeubiger: "Alte Bauspar AG (TESTDATEN)", betrag: "400000", rang: 1, eingetragenAm: new Date("2005-06-01"), geloeschtAm: new Date("2017-03-15"), quelle: "GRUNDBUCHAUSZUG", stand: new Date("2026-03-31"), haeuser: { create: erster.haeuser.map((h) => ({ mandantId, hausId: h.hausId })) } },
    });
    anzahl += 3;
  }
  console.log(`Sicherheiten: ${anzahl} Testeinträge.`);
}
