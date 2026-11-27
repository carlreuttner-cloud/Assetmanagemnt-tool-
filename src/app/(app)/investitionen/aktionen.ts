"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { alsDbDatum } from "@/lib/datum";
import { erlaubt } from "@/lib/daten/portfolio";
import { zuText } from "@/lib/geld";
import { EingabeFehler, formularLeser, fuehreAus, type AktionsErgebnis } from "@/lib/formular";

const STATI = ["GEPLANT", "LAUFEND", "ABGESCHLOSSEN"] as const;

async function schreibKontext() {
  const kontext = await pruefeZugriff("haeuser", "schreiben");
  const sicht = await sichtbarkeit(kontext);
  return { kontext, db: kontext.db, t: texte(kontext.mandant.sprache), sprache: kontext.mandant.sprache, sicht };
}

/** Maßnahme laden, nur wenn ihr Haus sichtbar ist. */
async function ladeMassnahme(k: Awaited<ReturnType<typeof schreibKontext>>, id: string) {
  const m = await k.db.massnahme.findFirst({ where: { id, hausId: erlaubt(k.sicht.hausIds) }, select: { id: true, hausId: true } });
  if (!m) throw new EingabeFehler(k.t.massnahmen.unbekannteMassnahme);
  return m;
}

export async function massnahmeSpeichern(id: string | null, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  let ziel = id;
  const ergebnis = await fuehreAus(async () => {
    const k = await schreibKontext();
    const { db, t, sprache } = k;
    const tm = t.massnahmen;
    const f = formularLeser(fd, sprache);
    const hausId = id ? (await ladeMassnahme(k, id)).hausId : f.pflicht("hausId", tm.haus);
    if (!id && !(await db.haus.findFirst({ where: { id: erlaubt(k.sicht.hausIds, hausId) }, select: { id: true } }))) throw new EingabeFehler(tm.hausFehlt);
    const einheitId = f.text("einheitId");
    if (einheitId && !(await db.einheit.findFirst({ where: { id: einheitId, hausId }, select: { id: true } }))) throw new EingabeFehler(tm.hausFehlt);
    const beginn = f.datumOptional("beginn", tm.beginn);
    const ende = f.datumOptional("ende", tm.ende);
    const daten = {
      einheitId,
      bezeichnung: f.pflicht("bezeichnung", tm.bezeichnung),
      kategorie: f.text("kategorie"),
      status: f.auswahl("status", tm.status, STATI),
      budget: zuText(f.betragOptional("budget", tm.budget)),
      budgetQuelle: f.text("budgetQuelle"),
      beginn: beginn ? alsDbDatum(beginn) : null,
      ende: ende ? alsDbDatum(ende) : null,
      mehrmieteMonat: zuText(f.betragOptional("mehrmieteMonat", tm.mehrmieteMonat)),
      mehrmieteBelegt: fd.get("mehrmieteBelegt") === "on",
      mehrmieteQuelle: f.text("mehrmieteQuelle"),
      notiz: f.text("notiz"),
    };
    if (id) {
      await db.massnahme.update({ where: { id }, data: daten });
    } else {
      const neu = await db.massnahme.create({ data: { ...daten, hausId } as never });
      ziel = neu.id;
    }
  });
  if (ergebnis.fehler) return ergebnis;
  redirect(`/investitionen/${ziel}`);
}

export async function massnahmeLoeschen(id: string): Promise<AktionsErgebnis> {
  const ergebnis = await fuehreAus(async () => {
    const k = await schreibKontext();
    await ladeMassnahme(k, id);
    // Kostenpositionen bleiben als Investitionen ohne Maßnahme erhalten (onDelete: SetNull).
    await k.db.massnahme.delete({ where: { id } });
  });
  if (ergebnis.fehler) return ergebnis;
  redirect("/investitionen");
}

export async function kostenpositionHinzufuegen(massnahmeId: string, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const k = await schreibKontext();
    const m = await ladeMassnahme(k, massnahmeId);
    const full = await k.db.massnahme.findUnique({ where: { id: m.id }, select: { einheitId: true, kategorie: true } });
    const f = formularLeser(fd, k.sprache);
    const tm = k.t.massnahmen;
    await k.db.investition.create({
      data: {
        hausId: m.hausId,
        einheitId: full?.einheitId ?? null,
        massnahmeId: m.id,
        datum: alsDbDatum(f.datum("datum", tm.datum)),
        betrag: zuText(f.betrag("betrag", tm.betrag)),
        kategorie: full?.kategorie ?? null,
        beschreibung: f.pflicht("beschreibung", tm.beschreibung),
      } as never,
    });
    refresh();
    return { ok: k.t.allgemein.gespeichert };
  });
}

/** Ordnet freie Kostenpositionen desselben Hauses der Maßnahme zu. */
export async function kostenZuordnen(massnahmeId: string, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const k = await schreibKontext();
    const m = await ladeMassnahme(k, massnahmeId);
    const ids = fd.getAll("investition").filter((x): x is string => typeof x === "string");
    if (ids.length > 0) {
      await k.db.investition.updateMany({ where: { id: { in: ids }, hausId: m.hausId, massnahmeId: null }, data: { massnahmeId: m.id } });
    }
    refresh();
    return { ok: k.t.allgemein.gespeichert };
  });
}

export async function kostenpositionLoesen(investitionId: string, massnahmeId: string): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const k = await schreibKontext();
    await ladeMassnahme(k, massnahmeId);
    await k.db.investition.updateMany({ where: { id: investitionId, massnahmeId }, data: { massnahmeId: null } });
    refresh();
  });
}
