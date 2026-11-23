/**
 * Prüft die Mandantentrennung gegen eine echte Datenbank.
 * Läuft nur, wenn DATABASE_URL gesetzt ist; legt eigene Testmandanten an und räumt sie wieder ab.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const mitDb = !!process.env.DATABASE_URL;

describe.skipIf(!mitDb)("mandantDb", async () => {
  const { basisDb } = await import("@/lib/db/client");
  const { mandantDb } = await import("@/lib/db/mandant");
  const kennung = `test-${Date.now()}`;
  let a: { id: string }, b: { id: string };
  let gesellschaftB: { id: string };

  beforeAll(async () => {
    a = await basisDb.mandant.create({ data: { name: "Test A", slug: `${kennung}-a` } });
    b = await basisDb.mandant.create({ data: { name: "Test B", slug: `${kennung}-b` } });
    gesellschaftB = await basisDb.gesellschaft.create({ data: { mandantId: b.id, name: "Gehört B" } });
  });

  afterAll(async () => {
    await basisDb.mandant.deleteMany({ where: { slug: { startsWith: kennung } } });
  });

  it("setzt mandantId beim Anlegen und filtert beim Lesen", async () => {
    const dbA = mandantDb({ mandantId: a.id, benutzerId: null });
    const g = await dbA.gesellschaft.create({ data: { name: "Gehört A" } as never });
    expect(g.mandantId).toBe(a.id);

    const liste = await dbA.gesellschaft.findMany();
    expect(liste.map((x) => x.name)).toEqual(["Gehört A"]);
    expect(await dbA.gesellschaft.findUnique({ where: { id: gesellschaftB.id } })).toBeNull();
  });

  it("ändert und löscht keine fremden Datensätze", async () => {
    const dbA = mandantDb({ mandantId: a.id, benutzerId: null });
    await expect(
      dbA.gesellschaft.update({ where: { id: gesellschaftB.id }, data: { name: "gehackt" } }),
    ).rejects.toThrow();
    const anzahl = await dbA.gesellschaft.deleteMany({ where: { id: gesellschaftB.id } });
    expect(anzahl.count).toBe(0);
    const unveraendert = await basisDb.gesellschaft.findUnique({ where: { id: gesellschaftB.id } });
    expect(unveraendert?.name).toBe("Gehört B");
  });

  it("verhindert Verknüpfungen mit Datensätzen anderer Mandanten", async () => {
    const dbA = mandantDb({ mandantId: a.id, benutzerId: null });
    await expect(
      dbA.haus.create({ data: { gesellschaftId: gesellschaftB.id, bezeichnung: "Trick" } as never }),
    ).rejects.toThrow(/gehört nicht zu diesem Mandanten/);
    await expect(
      dbA.gesellschaft.create({ data: { mandantId: b.id, name: "Trick" } }),
    ).rejects.toThrow(/fremden Mandanten/);
  });

  it("schreibt das Änderungsprotokoll", async () => {
    const dbA = mandantDb({ mandantId: a.id, benutzerId: null });
    const g = await dbA.gesellschaft.create({ data: { name: "Protokolliert" } as never });
    await dbA.gesellschaft.update({ where: { id: g.id }, data: { name: "Umbenannt" } });
    await dbA.gesellschaft.delete({ where: { id: g.id } });
    const eintraege = await basisDb.aenderungsprotokoll.findMany({
      where: { datensatzId: g.id },
      orderBy: { zeitpunkt: "asc" },
    });
    expect(eintraege.map((e) => e.aktion)).toEqual(["ERSTELLT", "GEAENDERT", "GELOESCHT"]);
    expect((eintraege[1].alteWerte as { name: string }).name).toBe("Protokolliert");
    expect((eintraege[1].neueWerte as { name: string }).name).toBe("Umbenannt");
  });

  it("speichert Beträge exakt", async () => {
    const dbA = mandantDb({ mandantId: a.id, benutzerId: null });
    const g = await dbA.gesellschaft.create({ data: { name: "Geld" } as never });
    const h = await dbA.haus.create({
      data: { gesellschaftId: g.id, bezeichnung: "Haus", kaufpreis: "123456789012.34" } as never,
    });
    expect(h.kaufpreis?.toFixed(2)).toBe("123456789012.34");
  });
});
