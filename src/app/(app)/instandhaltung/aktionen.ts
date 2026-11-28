"use server";

import { refresh } from "next/cache";
import { notFound } from "next/navigation";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { alsDbDatum, heute, isoDatum } from "@/lib/datum";
import { erlaubt } from "@/lib/daten/portfolio";
import { formatierer } from "@/lib/format";
import { zuText } from "@/lib/geld";
import { BAUTEIL_ARTEN, istUebernommen, naechsteErneuerung } from "@/lib/instandhaltung";
import { EingabeFehler, formularLeser, fuehreAus, type AktionsErgebnis } from "@/lib/formular";

async function hausKontext(hausId: string) {
  const kontext = await pruefeZugriff("haeuser", "schreiben");
  const sicht = await sichtbarkeit(kontext);
  const h = await kontext.db.haus.findFirst({ where: { id: erlaubt(sicht.hausIds, hausId) }, select: { id: true, bezeichnung: true, gesellschaftId: true } });
  if (!h) notFound();
  return { kontext, haus: h, db: kontext.db, t: texte(kontext.mandant.sprache) };
}

function ganzzahl(wert: string | null, feld: string, t: ReturnType<typeof texte>, min: number, max: number): number | null {
  if (wert === null) return null;
  if (!/^\d+$/.test(wert) || Number(wert) < min || Number(wert) > max) throw new EingabeFehler(fuelle(t.fehler.zahl, { feld }));
  return Number(wert);
}

/** Bauteil anlegen oder (mit Feld „id“) ändern. */
export async function bauteilSpeichern(hausId: string, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { kontext, db, t } = await hausKontext(hausId);
    const ti = t.instandhaltung;
    const f = formularLeser(fd, kontext.mandant.sprache);
    const jahr = Number(heute().slice(0, 4));
    const kosten = f.betragOptional("geplanteKosten", ti.geplanteKosten);
    if (kosten && kosten.lessThan(0)) throw new EingabeFehler(fuelle(t.fehler.betrag, { feld: ti.geplanteKosten }));
    const kostenStand = f.datumOptional("kostenStand", ti.kostenStand);
    const daten = {
      art: f.auswahl("art", ti.art, BAUTEIL_ARTEN),
      bezeichnung: f.pflicht("bezeichnung", ti.bezeichnung),
      zyklusJahre: ganzzahl(f.text("zyklusJahre"), ti.zyklus, t, 1, 100),
      letzteErneuerung: ganzzahl(f.text("letzteErneuerung"), ti.letzteErneuerung, t, 1800, jahr),
      geplanteKosten: zuText(kosten),
      kostenQuelle: f.text("kostenQuelle"),
      kostenStand: kostenStand ? alsDbDatum(kostenStand) : null,
      notiz: f.text("notiz"),
    };
    if (kosten && !daten.kostenQuelle) throw new EingabeFehler(ti.quellePflicht);
    const id = f.text("id");
    if (id) {
      const b = await db.bauteil.findFirst({ where: { id, hausId }, select: { id: true } });
      if (!b) notFound();
      await db.bauteil.update({ where: { id }, data: daten as never });
    } else {
      await db.bauteil.create({ data: { hausId, ...daten, erstelltVon: kontext.benutzer.name } as never });
    }
    refresh();
    return { ok: t.allgemein.gespeichert };
  });
}

export async function bauteilLoeschen(hausId: string, id: string): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { db } = await hausKontext(hausId);
    const b = await db.bauteil.findFirst({ where: { id, hausId }, select: { id: true } });
    if (!b) notFound();
    await db.bauteil.delete({ where: { id } });
    refresh();
  });
}

/**
 * Übernimmt die nächste Erneuerung als Planposition „Ausgabe“ in die Liquiditätsplanung der
 * Gesellschaft. Voraussetzung: bekannte Kosten mit Quelle und Schreibrecht für Gesellschaften.
 */
export async function inLiquiditaetUebernehmen(hausId: string, bauteilId: string, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { kontext, db, t, haus } = await hausKontext(hausId);
    const ti = t.instandhaltung;
    if (!darf(kontext.rolle, "gesellschaften", "schreiben")) throw new EingabeFehler(ti.keinRechtLiquiditaet);
    const sicht = await sichtbarkeit(kontext);
    if (sicht.gesellschaftIds !== "alle" && !sicht.gesellschaftIds.includes(haus.gesellschaftId)) throw new EingabeFehler(ti.keinRechtLiquiditaet);
    const b = await db.bauteil.findFirst({ where: { id: bauteilId, hausId }, include: { planpositionen: { select: { monat: true } } } });
    if (!b) notFound();
    if (b.geplanteKosten === null) throw new EingabeFehler(ti.ohneKostenNichtUebernehmen);
    if (naechsteErneuerung(b) === null) throw new EingabeFehler(ti.ohneFaelligkeit);
    if (istUebernommen(b, b.planpositionen.map((p) => ({ monat: isoDatum(p.monat)! })))) throw new EingabeFehler(ti.schonUebernommen);
    const monat = formularLeser(fd, kontext.mandant.sprache).datum("monat", ti.planMonat);
    if (monat.slice(0, 7) < heute().slice(0, 7)) throw new EingabeFehler(ti.monatVergangen);
    const stand = isoDatum(b.kostenStand);
    await db.planposition.create({
      data: {
        gesellschaftId: haus.gesellschaftId,
        art: "AUSGABE",
        monat: alsDbDatum(`${monat.slice(0, 7)}-01`),
        betrag: zuText(b.geplanteKosten),
        bezeichnung: fuelle(ti.positionBezeichnung, { art: ti.arten[b.art], bauteil: b.bezeichnung, haus: haus.bezeichnung }),
        quelle: fuelle(stand ? ti.positionQuelleStand : ti.positionQuelle, { quelle: b.kostenQuelle ?? "–", stand: stand ? formatierer(kontext.mandant).datum(stand) : "" }),
        bauteilId: b.id,
      } as never,
    });
    refresh();
    return { ok: ti.uebernommenOk };
  });
}
