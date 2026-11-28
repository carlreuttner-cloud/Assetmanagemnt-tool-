"use server";

import { refresh } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { alsDbDatum, isoDatum, plusTage } from "@/lib/datum";
import { erlaubt } from "@/lib/daten/portfolio";
import { formatierer } from "@/lib/format";
import { EingabeFehler, formularLeser, fuehreAus, type AktionsErgebnis } from "@/lib/formular";
import { ueberschneidet } from "@/lib/hausverwaltung";

/** Hausverwaltung anlegen oder (mit Feld „id“) ändern. */
export async function hausverwaltungSpeichern(_v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  let neueId: string | null = null;
  const ergebnis = await fuehreAus(async () => {
    const kontext = await pruefeZugriff("haeuser", "schreiben");
    const t = texte(kontext.mandant.sprache);
    const th = t.hausverwaltungen;
    const f = formularLeser(fd, kontext.mandant.sprache);
    const daten = { name: f.pflicht("name", th.name), ansprechpartner: f.text("ansprechpartner"), email: f.text("email"), telefon: f.text("telefon"), notiz: f.text("notiz") };
    const id = f.text("id");
    if (id) {
      const { count } = await kontext.db.hausverwaltung.updateMany({ where: { id }, data: daten });
      if (count === 0) notFound();
      refresh();
      return { ok: t.allgemein.gespeichert };
    }
    neueId = (await kontext.db.hausverwaltung.create({ data: daten as never })).id;
  });
  if (neueId) redirect(`/hausverwaltungen/${neueId}`);
  return ergebnis;
}

export async function hausverwaltungLoeschen(id: string): Promise<AktionsErgebnis> {
  let geloescht = false;
  const ergebnis = await fuehreAus(async () => {
    const kontext = await pruefeZugriff("haeuser", "schreiben");
    const t = texte(kontext.mandant.sprache);
    if ((await kontext.db.hausverwaltungZuordnung.count({ where: { hausverwaltungId: id } })) > 0) throw new EingabeFehler(t.hausverwaltungen.loeschenGesperrt);
    const { count } = await kontext.db.hausverwaltung.deleteMany({ where: { id } });
    if (count === 0) notFound();
    geloescht = true;
  });
  if (geloescht) redirect("/hausverwaltungen");
  return ergebnis;
}

/**
 * Haus einer Hausverwaltung zuordnen. Läuft für das Haus noch eine Zuordnung, die vorher
 * begonnen hat, endet sie am Vortag (Wechsel der Hausverwaltung). Andere Überschneidungen
 * werden abgelehnt.
 */
export async function zuordnungSpeichern(hausverwaltungId: string, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const kontext = await pruefeZugriff("haeuser", "schreiben");
    const t = texte(kontext.mandant.sprache);
    const th = t.hausverwaltungen;
    const fmt = formatierer(kontext.mandant);
    const f = formularLeser(fd, kontext.mandant.sprache);
    const sicht = await sichtbarkeit(kontext);
    const hausId = f.pflicht("hausId", th.haus);
    const haus = await kontext.db.haus.findFirst({ where: { id: erlaubt(sicht.hausIds, hausId) }, select: { id: true } });
    if (!haus) throw new EingabeFehler(fuelle(t.fehler.pflichtfeld, { feld: th.haus }));
    const hv = await kontext.db.hausverwaltung.findFirst({ where: { id: hausverwaltungId }, select: { id: true } });
    if (!hv) notFound();
    const von = f.datum("von", th.von);
    const bis = f.datumOptional("bis", th.bis);
    if (bis && bis < von) throw new EingabeFehler(th.bisVorVon);
    const vorhandene = (await kontext.db.hausverwaltungZuordnung.findMany({ where: { hausId }, include: { hausverwaltung: { select: { name: true } } } })).map((z) => ({
      id: z.id,
      hausId: z.hausId,
      hausverwaltungId: z.hausverwaltungId,
      von: isoDatum(z.von),
      bis: isoDatum(z.bis),
      name: z.hausverwaltung.name,
    }));
    // Wechsel: laufende Zuordnung, die vorher begonnen hat, endet am Vortag
    const laufend = vorhandene.find((z) => z.bis === null && z.von < von);
    const ende = plusTage(von, -1);
    const geprueft = vorhandene.map((z) => (z === laufend ? { ...z, bis: ende } : z));
    const konflikt = ueberschneidet({ hausId, hausverwaltungId, von, bis }, geprueft);
    if (konflikt) {
      const k = geprueft.find((z) => z.id === konflikt.id)!;
      throw new EingabeFehler(fuelle(th.ueberschneidung, { name: k.name, von: fmt.datum(k.von), bis: k.bis ? fmt.datum(k.bis) : th.laeuft }));
    }
    if (laufend) await kontext.db.hausverwaltungZuordnung.update({ where: { id: laufend.id }, data: { bis: alsDbDatum(ende) } });
    await kontext.db.hausverwaltungZuordnung.create({ data: { hausId, hausverwaltungId, von: alsDbDatum(von), bis: bis ? alsDbDatum(bis) : null, notiz: f.text("notiz") } as never });
    refresh();
    return { ok: laufend ? fuelle(th.gewechselt, { name: laufend.name, datum: fmt.datum(ende) }) : t.allgemein.gespeichert };
  });
}

export async function zuordnungLoeschen(id: string): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const kontext = await pruefeZugriff("haeuser", "schreiben");
    const sicht = await sichtbarkeit(kontext);
    const { count } = await kontext.db.hausverwaltungZuordnung.deleteMany({ where: { id, hausId: erlaubt(sicht.hausIds) } });
    if (count === 0) notFound();
    refresh();
  });
}
