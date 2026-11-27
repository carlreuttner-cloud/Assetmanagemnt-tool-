"use server";

import { refresh } from "next/cache";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { alsDbDatum } from "@/lib/datum";
import { erlaubt } from "@/lib/daten/portfolio";
import { zuText } from "@/lib/geld";
import { EingabeFehler, formularLeser, fuehreAus, type AktionsErgebnis } from "@/lib/formular";

const ARTEN = ["AUSSCHUETTUNG", "EINNAHME", "AUSGABE"] as const;

/** Schreibrechte für Gesellschaften und Prüfung, dass die Gesellschaft sichtbar ist. */
async function schreibKontext(gesellschaftId: string) {
  const kontext = await pruefeZugriff("gesellschaften", "schreiben");
  const sicht = await sichtbarkeit(kontext);
  const t = texte(kontext.mandant.sprache);
  const g = await kontext.db.gesellschaft.findFirst({ where: { id: erlaubt(sicht.gesellschaftIds, gesellschaftId) }, select: { id: true } });
  if (!g) throw new EingabeFehler(t.liquiditaet.gesellschaftFehlt);
  return { db: kontext.db, t, tl: t.liquiditaet, f: (fd: FormData) => formularLeser(fd, kontext.mandant.sprache) };
}

export async function kontostandHinzufuegen(gesellschaftId: string, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { db, t, tl, f: leser } = await schreibKontext(gesellschaftId);
    const f = leser(fd);
    await db.bankkontostand.create({
      data: {
        gesellschaftId,
        konto: f.pflicht("konto", tl.konto),
        stichtag: alsDbDatum(f.datum("stichtag", tl.stichtag)),
        betrag: zuText(f.betrag("betrag", tl.betrag)),
        quelle: f.text("quelle"),
      } as never,
    });
    refresh();
    return { ok: t.allgemein.gespeichert };
  });
}

export async function kontostandLoeschen(gesellschaftId: string, id: string): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { db, tl } = await schreibKontext(gesellschaftId);
    const { count } = await db.bankkontostand.deleteMany({ where: { id, gesellschaftId } });
    if (count === 0) throw new EingabeFehler(tl.kontostandFehlt);
    refresh();
  });
}

export async function mindestliquiditaetSpeichern(gesellschaftId: string, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { db, t, tl, f: leser } = await schreibKontext(gesellschaftId);
    const wert = leser(fd).betragOptional("mindestliquiditaet", tl.mindestliquiditaet);
    await db.gesellschaft.update({ where: { id: gesellschaftId }, data: { mindestliquiditaet: zuText(wert) } });
    refresh();
    return { ok: t.allgemein.gespeichert };
  });
}

export async function planpositionHinzufuegen(gesellschaftId: string, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { db, t, tl, f: leser } = await schreibKontext(gesellschaftId);
    const f = leser(fd);
    const betrag = f.betrag("betrag", tl.betrag);
    if (betrag.lessThanOrEqualTo(0)) throw new EingabeFehler(fuelle(t.fehler.betrag, { feld: tl.betrag }));
    const monat = f.datum("monat", tl.planMonat);
    await db.planposition.create({
      data: {
        gesellschaftId,
        art: f.auswahl("art", tl.art, ARTEN),
        monat: alsDbDatum(`${monat.slice(0, 7)}-01`),
        betrag: zuText(betrag),
        bezeichnung: f.pflicht("bezeichnung", tl.bezeichnung),
        quelle: f.text("quelle"),
      } as never,
    });
    refresh();
    return { ok: t.allgemein.gespeichert };
  });
}

export async function planpositionLoeschen(gesellschaftId: string, id: string): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { db, tl } = await schreibKontext(gesellschaftId);
    const { count } = await db.planposition.deleteMany({ where: { id, gesellschaftId } });
    if (count === 0) throw new EingabeFehler(tl.positionFehlt);
    refresh();
  });
}
