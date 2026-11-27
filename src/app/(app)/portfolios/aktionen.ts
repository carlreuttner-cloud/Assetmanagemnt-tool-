"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { EingabeFehler, formularLeser, fuehreAus, type AktionsErgebnis } from "@/lib/formular";

async function schreibKontext() {
  const kontext = await pruefeZugriff("gesellschaften", "schreiben");
  return { kontext, db: kontext.db, t: texte(kontext.mandant.sprache), sprache: kontext.mandant.sprache };
}

/** Anlegen (id = null) oder Name/Beschreibung ändern. */
export async function portfolioSpeichern(id: string | null, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  let ziel = id;
  const ergebnis = await fuehreAus(async () => {
    const { db, t, sprache } = await schreibKontext();
    const f = formularLeser(fd, sprache);
    const daten = { name: f.pflicht("name", t.portfolios.name), beschreibung: f.text("beschreibung") };
    const doppelt = await db.portfolio.count({ where: { name: { equals: daten.name, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) } });
    if (doppelt > 0) throw new EingabeFehler(t.portfolios.nameDoppelt);
    if (id) {
      await db.portfolio.update({ where: { id }, data: daten });
      refresh();
      return { ok: t.allgemein.gespeichert };
    }
    ziel = (await db.portfolio.create({ data: daten as never })).id;
  });
  if (ergebnis.fehler || id) return ergebnis;
  redirect(`/portfolios/${ziel}`);
}

/**
 * Setzt die Gesellschaften des Portfolios auf die angekreuzten. Angekreuzte aus anderen
 * Portfolios werden verschoben, abgewählte kommen zu "Ohne Portfolio".
 */
export async function portfolioZuordnen(id: string, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { kontext, db, t } = await schreibKontext();
    const portfolio = await db.portfolio.findFirst({ where: { id }, select: { id: true } });
    if (!portfolio) throw new EingabeFehler(t.fehler.unbekannt);
    const sicht = await sichtbarkeit(kontext);
    const sichtbar = (g: string) => sicht.gesellschaftIds === "alle" || sicht.gesellschaftIds.includes(g);
    const gewaehlt = [...new Set(formularLeser(fd).alle("gesellschaft").filter(Boolean))].filter(sichtbar);
    const bisher = (await db.gesellschaft.findMany({ where: { portfolioId: id }, select: { id: true } })).map((g) => g.id).filter(sichtbar);
    const entfernen = bisher.filter((g) => !gewaehlt.includes(g));
    const hinzu = gewaehlt.filter((g) => !bisher.includes(g));
    if (entfernen.length > 0) await db.gesellschaft.updateMany({ where: { id: { in: entfernen } }, data: { portfolioId: null } });
    if (hinzu.length > 0) await db.gesellschaft.updateMany({ where: { id: { in: hinzu } }, data: { portfolioId: id } });
    refresh();
    return { ok: t.allgemein.gespeichert };
  });
}

/** Löscht das Portfolio; die Gesellschaften bleiben und stehen danach ohne Portfolio. */
export async function portfolioLoeschen(id: string): Promise<AktionsErgebnis> {
  const ergebnis = await fuehreAus(async () => {
    const { db } = await schreibKontext();
    await db.gesellschaft.updateMany({ where: { portfolioId: id }, data: { portfolioId: null } });
    await db.portfolio.delete({ where: { id } });
  });
  if (ergebnis.fehler) return ergebnis;
  redirect("/portfolios");
}
