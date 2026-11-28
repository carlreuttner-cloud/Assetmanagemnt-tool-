"use server";

import { notFound, redirect } from "next/navigation";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { alsDbDatum } from "@/lib/datum";
import { erlaubt } from "@/lib/daten/portfolio";
import { sicherheitFilter } from "@/lib/daten/sicherheiten";
import { EingabeFehler, formularLeser, fuehreAus, type AktionsErgebnis } from "@/lib/formular";
import { SICHERHEIT_ARTEN, SICHERHEIT_QUELLEN } from "@/lib/sicherheit";

/** Legt eine Sicherheit an (id null) oder ändert sie; Häuser und Kredite werden ersetzt. */
export async function sicherheitSpeichern(id: string | null, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  let ziel: string | null = null;
  const ergebnis = await fuehreAus(async () => {
    const kontext = await pruefeZugriff("gesellschaften", "schreiben");
    const sicht = await sichtbarkeit(kontext);
    const t = texte(kontext.mandant.sprache);
    const ts = t.sicherheiten;
    const db = kontext.db;
    if (id && !(await db.sicherheit.findFirst({ where: { id, ...sicherheitFilter(sicht) }, select: { id: true } }))) notFound();
    const f = formularLeser(fd, kontext.mandant.sprache);
    const rangText = f.text("rang");
    if (rangText && !/^[1-9]\d{0,2}$/.test(rangText)) throw new EingabeFehler(ts.fehlerRang);
    const datum = (name: string, feld: string) => {
      const w = f.datumOptional(name, feld);
      return w ? alsDbDatum(w) : null;
    };
    // Nur Häuser, Kredite und Gesellschaften, die die Rolle sieht
    const [haeuser, kredite] = await Promise.all([
      db.haus.findMany({ where: { id: { in: f.alle("hausIds").filter(Boolean) }, gesellschaftId: erlaubt(sicht.gesellschaftIds) }, select: { id: true } }),
      db.kredit.findMany({ where: { id: { in: f.alle("kreditIds").filter(Boolean) }, gesellschaftId: erlaubt(sicht.gesellschaftIds) }, select: { id: true } }),
    ]);
    const gesellschaftId = f.text("gesellschaftId");
    if (gesellschaftId && sicht.gesellschaftIds !== "alle" && !sicht.gesellschaftIds.includes(gesellschaftId)) throw new EingabeFehler(fuelle(t.fehler.pflichtfeld, { feld: ts.felder.gesellschaft }));
    const dokumentId = f.text("dokumentId");
    if (dokumentId && !(await db.dokument.findFirst({ where: { id: dokumentId }, select: { id: true } }))) throw new EingabeFehler(fuelle(t.fehler.pflichtfeld, { feld: ts.felder.dokument }));
    const daten = {
      art: f.auswahl("art", ts.felder.art, SICHERHEIT_ARTEN),
      glaeubiger: f.pflicht("glaeubiger", ts.felder.glaeubiger).slice(0, 200),
      betrag: f.betragOptional("betrag", ts.felder.betrag),
      rang: rangText ? Number(rangText) : null,
      fundstelle: f.text("fundstelle")?.slice(0, 300) ?? null,
      sicherungsgeber: f.text("sicherungsgeber")?.slice(0, 200) ?? null,
      gesellschaftId,
      eingetragenAm: datum("eingetragenAm", ts.felder.eingetragenAm),
      gueltigBis: datum("gueltigBis", ts.felder.gueltigBis),
      geloeschtAm: datum("geloeschtAm", ts.felder.geloeschtAm),
      quelle: f.auswahl("quelle", ts.felder.quelle, SICHERHEIT_QUELLEN),
      stand: datum("stand", ts.felder.stand),
      dokumentId,
      notiz: f.text("notiz")?.slice(0, 2000) ?? null,
    };
    const s = id ? await db.sicherheit.update({ where: { id }, data: daten as never, select: { id: true } }) : await db.sicherheit.create({ data: daten as never, select: { id: true } });
    await db.sicherheitHaus.deleteMany({ where: { sicherheitId: s.id } });
    await db.sicherheitKredit.deleteMany({ where: { sicherheitId: s.id } });
    for (const h of haeuser) await db.sicherheitHaus.create({ data: { sicherheitId: s.id, hausId: h.id } as never });
    for (const k of kredite) await db.sicherheitKredit.create({ data: { sicherheitId: s.id, kreditId: k.id } as never });
    ziel = s.id;
  });
  if (ergebnis.fehler || !ziel) return ergebnis;
  redirect("/sicherheiten");
}

export async function sicherheitLoeschen(id: string): Promise<AktionsErgebnis> {
  const ergebnis = await fuehreAus(async () => {
    const kontext = await pruefeZugriff("gesellschaften", "schreiben");
    const sicht = await sichtbarkeit(kontext);
    await kontext.db.sicherheit.deleteMany({ where: { id, ...sicherheitFilter(sicht) } });
  });
  if (ergebnis.fehler) return ergebnis;
  redirect("/sicherheiten");
}
