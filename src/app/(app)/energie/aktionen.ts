"use server";

import { refresh } from "next/cache";
import { notFound } from "next/navigation";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { alsDbDatum, heute } from "@/lib/datum";
import { erlaubt } from "@/lib/daten/portfolio";
import { istEnergieklasse, MEDIEN } from "@/lib/energie";
import { zuText } from "@/lib/geld";
import { EingabeFehler, formularLeser, fuehreAus, type AktionsErgebnis } from "@/lib/formular";

const ARTEN = ["BEDARF", "VERBRAUCH"] as const;

async function hausKontext(hausId: string) {
  const kontext = await pruefeZugriff("haeuser", "schreiben");
  const sicht = await sichtbarkeit(kontext);
  const h = await kontext.db.haus.findFirst({ where: { id: erlaubt(sicht.hausIds, hausId) }, select: { id: true } });
  if (!h) notFound();
  return { kontext, db: kontext.db, t: texte(kontext.mandant.sprache) };
}

export async function ausweisSpeichern(hausId: string, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { kontext, db, t } = await hausKontext(hausId);
    const te = t.energie;
    const f = formularLeser(fd, kontext.mandant.sprache);
    const klasse = f.text("energieklasse");
    if (klasse && !istEnergieklasse(klasse)) throw new EingabeFehler(te.klasseUngueltig);
    const ausgestelltAm = f.datumOptional("ausgestelltAm", te.ausgestelltAm);
    const gueltigBis = f.datumOptional("gueltigBis", te.gueltigBis);
    if (ausgestelltAm && gueltigBis && gueltigBis <= ausgestelltAm) throw new EingabeFehler(fuelle(t.fehler.datum, { feld: te.gueltigBis }));
    await db.energieausweis.create({
      data: {
        hausId,
        art: f.auswahl("art", te.art, ARTEN),
        energieklasse: klasse,
        endenergie: zuText(f.betragOptional("endenergie", te.endenergie)),
        primaerenergie: zuText(f.betragOptional("primaerenergie", te.primaerenergie)),
        energietraeger: f.text("energietraeger"),
        ausgestelltAm: ausgestelltAm ? alsDbDatum(ausgestelltAm) : null,
        gueltigBis: gueltigBis ? alsDbDatum(gueltigBis) : null,
        registriernummer: f.text("registriernummer"),
        quelle: f.text("quelle"),
        notiz: f.text("notiz"),
        erstelltVon: kontext.benutzer.name,
      } as never,
    });
    refresh();
    return { ok: t.allgemein.gespeichert };
  });
}

export async function ausweisLoeschen(hausId: string, id: string): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { db } = await hausKontext(hausId);
    const a = await db.energieausweis.findFirst({ where: { id, hausId }, select: { id: true } });
    if (!a) notFound();
    await db.energieausweis.delete({ where: { id } });
    refresh();
  });
}

/** Verbrauch je Jahr und Medium; ein vorhandener Eintrag für Jahr und Medium wird ersetzt. */
export async function verbrauchSpeichern(hausId: string, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { kontext, db, t } = await hausKontext(hausId);
    const te = t.energie;
    const f = formularLeser(fd, kontext.mandant.sprache);
    const jahrText = f.pflicht("jahr", te.jahr);
    if (!/^\d{4}$/.test(jahrText) || Number(jahrText) > Number(heute().slice(0, 4))) throw new EingabeFehler(fuelle(t.fehler.zahl, { feld: te.jahr }));
    const jahr = Number(jahrText);
    const medium = f.auswahl("medium", te.medium, MEDIEN);
    const daten = {
      menge: zuText(f.betrag("menge", te.menge)),
      kosten: zuText(f.betragOptional("kosten", te.kosten)),
      co2Kg: zuText(f.betragOptional("co2Kg", te.co2)),
      energietraeger: f.text("energietraeger"),
      quelle: f.pflicht("quelle", te.quelle),
      notiz: f.text("notiz"),
    };
    await db.energieverbrauch.upsert({
      where: { hausId_jahr_medium: { hausId, jahr, medium } },
      create: { hausId, jahr, medium, ...daten } as never,
      update: daten as never,
    });
    refresh();
    return { ok: t.allgemein.gespeichert };
  });
}

export async function verbrauchLoeschen(hausId: string, id: string): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { db } = await hausKontext(hausId);
    const v = await db.energieverbrauch.findFirst({ where: { id, hausId }, select: { id: true } });
    if (!v) notFound();
    await db.energieverbrauch.delete({ where: { id } });
    refresh();
  });
}
