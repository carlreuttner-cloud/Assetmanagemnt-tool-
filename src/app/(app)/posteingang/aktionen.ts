"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { ladeEingangKandidaten, nimmAuf, uebernimm, type Uebernahme } from "@/lib/daten/eingang";
import { ABSENDER_ARTEN, DOKUMENT_KATEGORIEN, type AbsenderArt } from "@/lib/dokument-vorschlag";
import type { EingangVorschlag } from "@/lib/eingang";
import { EingabeFehler, formularLeser, fuehreAus, type AktionsErgebnis } from "@/lib/formular";

const MAX_DATEIEN = 20;

async function schreibKontext() {
  const kontext = await pruefeZugriff("dokumente", "schreiben");
  return { kontext, db: kontext.db, t: texte(kontext.mandant.sprache) };
}

/** Mehrere Dateien in den Posteingang aufnehmen (Prüfung, Texterkennung, Vorschlag). */
export async function eingangHochladen(_v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { kontext, db, t } = await schreibKontext();
    const te = t.eingang;
    const dateien = fd.getAll("dateien").filter((d): d is File => d instanceof File && d.size > 0).slice(0, MAX_DATEIEN);
    if (dateien.length === 0) throw new EingabeFehler(t.dateien.keineDatei);
    let ok = 0;
    const fehler: string[] = [];
    for (const datei of dateien) {
      const r = await nimmAuf(db, kontext.mandant, { daten: new Uint8Array(await datei.arrayBuffer()), dateiname: datei.name, quelle: "HOCHLADEN", hochgeladenVonId: kontext.benutzer.id });
      if (r.ok) ok++;
      else fehler.push(r.fehler);
    }
    refresh();
    if (ok === 0) throw new EingabeFehler(`${te.nichtAufgenommen} ${fehler.join("; ")}`);
    return { ok: [fuelle(te.aufgenommen, { anzahl: ok }), fehler.length ? `${te.nichtAufgenommen} ${fehler.join("; ")}` : ""].filter(Boolean).join(" ") };
  });
}

/** Liest die geprüften Felder; die Zuordnung muss ein Objekt des Mandanten sein. */
async function leseUebernahme(fd: FormData, db: Awaited<ReturnType<typeof schreibKontext>>["db"], t: ReturnType<typeof texte>, sprache: string): Promise<Uebernahme> {
  const td = t.dateien;
  const f = formularLeser(fd, sprache);
  const kategorie = f.text("kategorie");
  if (kategorie && !DOKUMENT_KATEGORIEN.some((k) => k.name === kategorie)) throw new EingabeFehler(fuelle(t.fehler.pflichtfeld, { feld: td.kategorie }));
  const jahrText = f.text("jahr");
  const jahr = jahrText ? Number(jahrText) : null;
  if (jahrText && (!/^\d{4}$/.test(jahrText) || jahr! < 1900 || jahr! > 2100)) throw new EingabeFehler(fuelle(t.fehler.zahl, { feld: td.jahr }));
  const datum = f.datumOptional("dokumentDatum", td.datum);
  const absenderArt = f.text("absenderArt") as AbsenderArt | null;
  if (absenderArt && !ABSENDER_ARTEN.includes(absenderArt)) throw new EingabeFehler(fuelle(t.fehler.pflichtfeld, { feld: td.absender }));
  const zuordnung = f.text("zuordnung");
  let objekt: Uebernahme["objekt"] = null;
  if (zuordnung) {
    const [art, id] = zuordnung.split(":");
    const k = (await ladeEingangKandidaten(db)).find((x) => x.art === art && x.id === id);
    if (!k) throw new EingabeFehler(fuelle(t.fehler.pflichtfeld, { feld: td.zuordnung }));
    objekt = { art: k.art, id: k.id, name: k.name };
  }
  return { titel: f.pflicht("titel", td.name), kategorie, jahr, datum, absenderArt, absenderName: f.text("absenderName")?.slice(0, 200) ?? null, objekt };
}

export async function eingangUebernehmen(id: string, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const ergebnis = await fuehreAus(async () => {
    const { kontext, db, t } = await schreibKontext();
    const u = await leseUebernahme(fd, db, t, kontext.mandant.sprache);
    const e = await db.eingang.findFirst({ where: { id }, select: { status: true } });
    if (!e || !["ZU_PRUEFEN", "UNSICHER"].includes(e.status)) throw new EingabeFehler(t.fehler.unbekannt);
    await uebernimm(db, id, u, kontext.benutzer.id);
  });
  if (ergebnis.fehler) return ergebnis;
  redirect(`/posteingang/${id}`);
}

/** Übernimmt einen sicheren Vorschlag unverändert (nur Status „zu prüfen“ mit Sicherheit „sicher“). */
export async function schnellUebernehmen(id: string): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { kontext, db, t } = await schreibKontext();
    const e = await db.eingang.findFirst({ where: { id }, select: { status: true, vorschlag: true } });
    const v = e?.vorschlag as unknown as EingangVorschlag | null;
    if (!e || e.status !== "ZU_PRUEFEN" || !v || v.sicherheit !== "hoch") throw new EingabeFehler(t.fehler.unbekannt);
    await uebernimm(db, id, { titel: v.titel, kategorie: v.kategorie, jahr: v.jahr, datum: v.datum, absenderArt: v.absenderArt, absenderName: v.absenderName, objekt: v.objekt }, kontext.benutzer.id);
    refresh();
  });
}

export async function eingangAblehnen(id: string): Promise<AktionsErgebnis> {
  const ergebnis = await fuehreAus(async () => {
    const { kontext, db, t } = await schreibKontext();
    const e = await db.eingang.findFirst({ where: { id }, select: { status: true } });
    if (!e || e.status === "UEBERNOMMEN") throw new EingabeFehler(t.fehler.unbekannt);
    await db.eingang.update({ where: { id }, data: { status: "ABGELEHNT", bearbeitetVonId: kontext.benutzer.id, bearbeitetAm: new Date() } });
  });
  if (ergebnis.fehler) return ergebnis;
  redirect("/posteingang");
}

/** Gibt eine Mail aus der Quarantäne zur Prüfung frei. */
export async function eingangFreigeben(id: string): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { db, t } = await schreibKontext();
    const e = await db.eingang.findFirst({ where: { id }, select: { status: true, vorschlag: true } });
    if (!e || e.status !== "QUARANTAENE") throw new EingabeFehler(t.fehler.unbekannt);
    const v = e.vorschlag as unknown as EingangVorschlag | null;
    await db.eingang.update({ where: { id }, data: { status: v && v.sicherheit !== "niedrig" ? "ZU_PRUEFEN" : "UNSICHER" } });
    refresh();
  });
}

export async function regelLoeschen(id: string): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { db } = await schreibKontext();
    await db.zuordnungsregel.deleteMany({ where: { id } });
    refresh();
  });
}
