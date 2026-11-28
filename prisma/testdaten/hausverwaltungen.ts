/**
 * Testdaten Hausverwaltungen: drei Hausverwaltungen, die Häuser abwechselnd betreuen. Bei einem
 * Haus wechselt die Hausverwaltung vor drei Monaten (Zeitraum endet, neue Zuordnung beginnt),
 * ein Haus hat keine Hausverwaltung. Alle Namen sind erfunden (Testdaten).
 */
import type { PrismaClient } from "../../src/generated/prisma/client";
import { monatsanfang, monatsNummer } from "../../src/lib/datum";

const VERWALTUNGEN = [
  { name: "Hanse Hausverwaltung GmbH", ansprechpartner: "Frau Lindqvist", email: "verwaltung@hanse-hv.example", telefon: "040 000000-10" },
  { name: "Elbufer Immobilienverwaltung KG", ansprechpartner: "Herr Brandt", email: "kontakt@elbufer-iv.example", telefon: "040 000000-20" },
  { name: "Mittelweg Objektbetreuung", ansprechpartner: "Frau Okafor", email: "info@mittelweg-ob.example", telefon: null },
];

export async function baueHausverwaltungen(db: PrismaClient, mandantId: string, heute = new Date().toISOString().slice(0, 10)) {
  const hv = [];
  for (const v of VERWALTUNGEN) hv.push(await db.hausverwaltung.create({ data: { mandantId, ...v, notiz: "Testdaten" } }));
  const haeuser = await db.haus.findMany({ where: { mandantId }, orderBy: { bezeichnung: "asc" }, select: { id: true } });
  const datum = (iso: string) => new Date(`${iso}T00:00:00Z`);
  // Wechsel zum Monatsanfang vor drei Monaten
  const wechsel = monatsanfang(monatsNummer(heute) - 2);
  const vortag = new Date(datum(wechsel).getTime() - 86_400_000);
  for (const [i, h] of haeuser.entries()) {
    if (i === haeuser.length - 1) continue; // ein Haus ohne Hausverwaltung
    const ziel = hv[i % 2 === 0 ? 0 : i % 3 === 0 ? 2 : 1];
    if (i === 1) {
      // Wechsel: bis zum Vortag Hanse, danach Elbufer
      await db.hausverwaltungZuordnung.create({ data: { mandantId, hausId: h.id, hausverwaltungId: hv[0].id, von: datum("2019-01-01"), bis: vortag, notiz: "Vertrag gekündigt (Testdaten)" } });
      await db.hausverwaltungZuordnung.create({ data: { mandantId, hausId: h.id, hausverwaltungId: hv[1].id, von: datum(wechsel), notiz: "Übernahme (Testdaten)" } });
      continue;
    }
    await db.hausverwaltungZuordnung.create({ data: { mandantId, hausId: h.id, hausverwaltungId: ziel.id, von: datum("2019-01-01") } });
  }
}
