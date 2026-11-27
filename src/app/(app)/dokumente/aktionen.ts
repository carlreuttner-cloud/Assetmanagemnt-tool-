"use server";

import { refresh } from "next/cache";
import { notFound } from "next/navigation";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { alsDbDatum } from "@/lib/datum";
import { erlaubt } from "@/lib/daten/portfolio";
import { STANDARD_VORGABEN, type Bezug } from "@/lib/dokumente";
import { EingabeFehler, formularLeser, fuehreAus, type AktionsErgebnis } from "@/lib/formular";

const BEZUEGE = ["GESELLSCHAFT", "HAUS", "KREDIT"] as const;
const AUTOMATIKEN = ["GUTACHTEN", "JAHRESABSCHLUSS", "SALDENBESTAETIGUNG"] as const;
const ERFASSUNG = ["vorhanden", "fehlt", "nichtErforderlich"] as const;

async function schreibKontext() {
  const kontext = await pruefeZugriff("dokumente", "schreiben");
  return { kontext, db: kontext.db, t: texte(kontext.mandant.sprache), sprache: kontext.mandant.sprache };
}

const FELD: Record<Bezug, "gesellschaftId" | "hausId" | "kreditId"> = { GESELLSCHAFT: "gesellschaftId", HAUS: "hausId", KREDIT: "kreditId" };

/** Prüft, dass das Objekt sichtbar ist (Kredite über ihre Gesellschaft). */
async function pruefeObjekt(kontext: Awaited<ReturnType<typeof schreibKontext>>["kontext"], bezug: Bezug, id: string) {
  const sicht = await sichtbarkeit(kontext);
  const db = kontext.db;
  const gefunden =
    bezug === "GESELLSCHAFT"
      ? await db.gesellschaft.findFirst({ where: { id: erlaubt(sicht.gesellschaftIds, id) }, select: { id: true } })
      : bezug === "HAUS"
        ? await db.haus.findFirst({ where: { id: erlaubt(sicht.hausIds, id) }, select: { id: true } })
        : await db.kredit.findFirst({ where: { id, gesellschaftId: erlaubt(sicht.gesellschaftIds) }, select: { id: true } });
  if (!gefunden) notFound();
}

// ---------------------------------------------------------------------------
// Nachweise (Stand je Objekt)
// ---------------------------------------------------------------------------

export async function nachweisSpeichern(ort: { vorgabeId: string; bezug: Bezug; objektId: string }, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { kontext, db, t, sprache } = await schreibKontext();
    await pruefeObjekt(kontext, ort.bezug, ort.objektId);
    const vorgabe = await db.dokumentvorgabe.findFirst({ where: { id: ort.vorgabeId, bezug: ort.bezug }, select: { id: true } });
    if (!vorgabe) notFound();
    const f = formularLeser(fd, sprache);
    const td = t.dokumente;
    const erfassung = f.auswahl("erfassung", td.erfassungStatus, ERFASSUNG);
    const datum = f.datumOptional("dokumentDatum", td.stand);
    const daten = {
      vorhanden: erfassung === "vorhanden",
      nichtErforderlich: erfassung === "nichtErforderlich",
      dokumentDatum: datum ? alsDbDatum(datum) : null,
      ablageort: f.text("ablageort"),
      notiz: f.text("notiz"),
    };
    const feld = FELD[ort.bezug];
    const bisher = await db.dokumentnachweis.findFirst({ where: { vorgabeId: ort.vorgabeId, [feld]: ort.objektId }, select: { id: true } });
    if (bisher) await db.dokumentnachweis.update({ where: { id: bisher.id }, data: daten });
    else await db.dokumentnachweis.create({ data: { ...daten, vorgabeId: ort.vorgabeId, [feld]: ort.objektId } as never });
    refresh();
    return { ok: t.allgemein.gespeichert };
  });
}

export async function nachweisLoeschen(id: string, bezug: Bezug, objektId: string): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { kontext, db } = await schreibKontext();
    await pruefeObjekt(kontext, bezug, objektId);
    const n = await db.dokumentnachweis.findFirst({ where: { id, [FELD[bezug]]: objektId }, select: { id: true } });
    if (!n) notFound();
    await db.dokumentnachweis.delete({ where: { id } });
    refresh();
  });
}

// ---------------------------------------------------------------------------
// Vorgaben (Pflichtdokumente)
// ---------------------------------------------------------------------------

export async function vorgabeSpeichern(_v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { db, t, sprache } = await schreibKontext();
    const f = formularLeser(fd, sprache);
    const td = t.dokumente;
    const gueltig = f.text("gueltigMonate");
    if (gueltig && !/^\d{1,3}$/.test(gueltig)) throw new EingabeFehler(fuelle(t.fehler.zahl, { feld: td.gueltigMonate }));
    const automatik = f.text("automatik");
    if (automatik && !AUTOMATIKEN.includes(automatik as (typeof AUTOMATIKEN)[number])) throw new EingabeFehler(fuelle(t.fehler.pflichtfeld, { feld: td.automatik }));
    const daten = {
      name: f.pflicht("name", td.name),
      bezug: f.auswahl("bezug", td.bezug, BEZUEGE),
      gueltigMonate: gueltig ? Number(gueltig) : null,
      automatik: (automatik as (typeof AUTOMATIKEN)[number] | null) ?? null,
      beschreibung: f.text("beschreibung"),
    };
    if (await db.dokumentvorgabe.findFirst({ where: { bezug: daten.bezug, name: daten.name }, select: { id: true } })) throw new EingabeFehler(td.vorhandenSchon);
    const reihenfolge = await db.dokumentvorgabe.count({ where: { bezug: daten.bezug } });
    await db.dokumentvorgabe.create({ data: { ...daten, reihenfolge } as never });
    refresh();
    return { ok: t.allgemein.gespeichert };
  });
}

export async function vorgabeUmschalten(id: string): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { db } = await schreibKontext();
    const v = await db.dokumentvorgabe.findFirst({ where: { id }, select: { aktiv: true } });
    if (!v) notFound();
    await db.dokumentvorgabe.update({ where: { id }, data: { aktiv: !v.aktiv } });
    refresh();
  });
}

export async function vorgabeLoeschen(id: string): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { db, t } = await schreibKontext();
    if ((await db.dokumentnachweis.count({ where: { vorgabeId: id } })) > 0) throw new EingabeFehler(t.dokumente.loeschenNichtMoeglich);
    await db.dokumentvorgabe.delete({ where: { id } });
    refresh();
  });
}

/** Legt die Vorschlagsliste an (nur Einträge, deren Name es für den Bezug noch nicht gibt). */
export async function standardVorgabenAnlegen(): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { db, t } = await schreibKontext();
    const vorhanden = await db.dokumentvorgabe.findMany({ select: { bezug: true, name: true } });
    let anzahl = 0;
    for (const [i, v] of STANDARD_VORGABEN.entries()) {
      const text = t.dokumente.standard[v.schluessel as keyof typeof t.dokumente.standard];
      if (vorhanden.some((x) => x.bezug === v.bezug && x.name === text.name)) continue;
      await db.dokumentvorgabe.create({
        data: { name: text.name, beschreibung: text.beschreibung, bezug: v.bezug, gueltigMonate: v.gueltigMonate, automatik: v.automatik, reihenfolge: i } as never,
      });
      anzahl++;
    }
    refresh();
    return { ok: fuelle(t.dokumente.standardUebernommen, { anzahl }) };
  });
}
