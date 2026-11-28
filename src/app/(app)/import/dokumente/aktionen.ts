"use server";

import { createHash } from "node:crypto";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff, type Kontext } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { DOKUMENT_TYPEN, MAX_DOKUMENT_MB, dokumentTypAusInhalt, entferne, pfadAufDisk, speichere } from "@/lib/dateispeicher";
import { alsDbDatum } from "@/lib/datum";
import { dokumentFilter, ladeZuordnungsKandidaten } from "@/lib/daten/dateien";
import { erkenneText } from "@/lib/dokument-text";
import { ABSENDER_ARTEN, DOKUMENT_KATEGORIEN, einheitlicherName, erkenneAbsender, type AbsenderArt, erkenneDatum, erkenneJahr, erkenneKategorie, erkenneObjekt, jahrbezogen, ueblicheZuordnung } from "@/lib/dokument-vorschlag";
import { EingabeFehler, formularLeser, fuehreAus, type AktionsErgebnis } from "@/lib/formular";

async function schreibKontext() {
  const kontext = await pruefeZugriff("dokumente", "schreiben");
  return { kontext, db: kontext.db, t: texte(kontext.mandant.sprache) };
}

/** Text erkennen und je Seite speichern (ersetzt vorhandene Seiten). */
async function speichereText(kontext: Kontext, dokumentId: string, speicherPfad: string, mimeType: string) {
  const ergebnis = await erkenneText(pfadAufDisk(speicherPfad), mimeType);
  await kontext.db.dokumentSeite.deleteMany({ where: { dokumentId } });
  if (ergebnis.seiten.length > 0) {
    await kontext.db.dokumentSeite.createMany({
      data: ergebnis.seiten.map((text, i) => ({ dokumentId, nummer: i + 1, text: text.replace(/\u0000/g, "") })) as never,
    });
  }
  await kontext.db.dokument.update({
    where: { id: dokumentId },
    data: { textQuelle: ergebnis.quelle, textHinweis: ergebnis.hinweis, seitenAnzahl: ergebnis.seitenAnzahl },
  });
  return ergebnis;
}

/**
 * Speichert die Datei, erkennt den Text und legt einen Vorschlag für Name, Kategorie, Jahr und
 * Zuordnung an (unbestätigt). Danach bestätigt der Benutzer auf der Dokumentseite.
 */
export async function dokumentHochladen(_v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  let ziel: string | null = null;
  const ergebnis = await fuehreAus(async () => {
    const { kontext, db, t } = await schreibKontext();
    const td = t.dateien;
    const datei = fd.get("datei");
    if (!(datei instanceof File) || datei.size === 0) throw new EingabeFehler(td.keineDatei);
    if (datei.size > MAX_DOKUMENT_MB * 1024 * 1024) throw new EingabeFehler(fuelle(td.zuGross, { mb: MAX_DOKUMENT_MB }));
    const daten = new Uint8Array(await datei.arrayBuffer());
    const mimeType = dokumentTypAusInhalt(daten);
    if (!mimeType) throw new EingabeFehler(td.falscherTyp);
    const pruefsumme = createHash("sha256").update(daten).digest("hex");
    const doppelt = await db.dokument.findFirst({ where: { pruefsumme }, select: { titel: true } });
    if (doppelt) throw new EingabeFehler(fuelle(td.doppelt, { titel: doppelt.titel }));

    const speicherPfad = await speichere(kontext.mandant.id, "dokumente", DOKUMENT_TYPEN[mimeType], daten);
    const dateiname = (datei.name || "Dokument").slice(0, 255);
    const dokument = await db.dokument.create({
      data: {
        titel: dateiname,
        speicherPfad,
        dateiname,
        mimeType,
        groesseBytes: daten.length,
        pruefsumme,
        hochgeladenVonId: kontext.benutzer.id,
      } as never,
    });
    try {
      const text = await speichereText(kontext, dokument.id, speicherPfad, mimeType);
      const volltext = text.seiten.join("\n");
      const kategorie = erkenneKategorie(volltext, dateiname)?.kategorie ?? null;
      const jahr = jahrbezogen(kategorie) ? erkenneJahr(volltext, dateiname) : null;
      const datum = jahr ? null : erkenneDatum(volltext);
      const objekt = erkenneObjekt(volltext, await ladeZuordnungsKandidaten(kontext), ueblicheZuordnung(kategorie))?.objekt ?? null;
      const banken = await db.kredit.findMany({ where: { bank: { not: null } }, distinct: ["bank"], select: { bank: true } });
      const absender = erkenneAbsender(volltext, kategorie, banken.map((b) => b.bank!));
      await db.dokument.update({
        where: { id: dokument.id },
        data: {
          kategorie,
          jahr,
          dokumentDatum: datum ? alsDbDatum(datum) : null,
          titel: einheitlicherName({ kategorie, jahr, datum, objekt: objekt?.name ?? null }, td.ohneKategorie),
          gesellschaftId: objekt?.art === "gesellschaft" ? objekt.id : null,
          hausId: objekt?.art === "haus" ? objekt.id : null,
          kreditId: objekt?.art === "kredit" ? objekt.id : null,
          absenderArt: absender?.art ?? null,
          absenderName: absender?.name ?? null,
        },
      });
    } catch (fehler) {
      // Datei bleibt gespeichert; der Benutzer kann den Text später neu erkennen lassen.
      console.error("Texterkennung fehlgeschlagen", fehler);
    }
    ziel = dokument.id;
  });
  if (ergebnis.fehler || !ziel) return ergebnis;
  redirect(`/import/dokumente/${ziel}`);
}

/** Bestätigt (bzw. ändert) Name, Kategorie, Jahr, Datum und Zuordnung. */
export async function dokumentBestaetigen(id: string, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const ergebnis = await fuehreAus(async () => {
    const { kontext, db, t } = await schreibKontext();
    const td = t.dateien;
    const f = formularLeser(fd, kontext.mandant.sprache);
    const vorhanden = await db.dokument.findFirst({ where: { id, ...dokumentFilter(await sichtbarkeit(kontext)) }, select: { id: true } });
    if (!vorhanden) throw new EingabeFehler(t.fehler.unbekannt);
    const kategorie = f.text("kategorie");
    if (kategorie && !DOKUMENT_KATEGORIEN.some((k) => k.name === kategorie)) throw new EingabeFehler(fuelle(t.fehler.pflichtfeld, { feld: td.kategorie }));
    const jahrText = f.text("jahr");
    const jahr = jahrText ? Number(jahrText) : null;
    if (jahrText && (!/^\d{4}$/.test(jahrText) || jahr! < 1900 || jahr! > 2100)) throw new EingabeFehler(fuelle(t.fehler.zahl, { feld: td.jahr }));
    const datum = f.datumOptional("dokumentDatum", td.datum);
    const absenderArt = f.text("absenderArt") as AbsenderArt | null;
    if (absenderArt && !ABSENDER_ARTEN.includes(absenderArt)) throw new EingabeFehler(fuelle(t.fehler.pflichtfeld, { feld: td.absender }));
    const absenderName = f.text("absenderName")?.slice(0, 200) ?? null;
    const zuordnung = f.text("zuordnung");
    let gesellschaftId: string | null = null;
    let hausId: string | null = null;
    let kreditId: string | null = null;
    if (zuordnung) {
      const [art, objektId] = zuordnung.split(":");
      const kandidat = (await ladeZuordnungsKandidaten(kontext)).find((k) => k.art === art && k.id === objektId);
      if (!kandidat) throw new EingabeFehler(fuelle(t.fehler.pflichtfeld, { feld: td.zuordnung }));
      if (art === "gesellschaft") gesellschaftId = objektId;
      if (art === "haus") hausId = objektId;
      if (art === "kredit") kreditId = objektId;
    }
    await db.dokument.update({
      where: { id },
      data: {
        titel: f.pflicht("titel", td.name).slice(0, 300),
        kategorie,
        jahr,
        dokumentDatum: datum ? alsDbDatum(datum) : null,
        gesellschaftId,
        hausId,
        kreditId,
        absenderArt,
        absenderName,
        bestaetigt: true,
      },
    });
  });
  if (ergebnis.fehler) return ergebnis;
  redirect(`/import/dokumente/${id}`);
}

export async function textNeuErkennen(id: string): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { kontext, db, t } = await schreibKontext();
    const d = await db.dokument.findFirst({ where: { id, ...dokumentFilter(await sichtbarkeit(kontext)) }, select: { speicherPfad: true, mimeType: true } });
    if (!d) throw new EingabeFehler(t.fehler.unbekannt);
    await speichereText(kontext, id, d.speicherPfad, d.mimeType);
    refresh();
    return { ok: t.dateien.neuErkanntOk };
  });
}

export async function dokumentLoeschen(id: string): Promise<AktionsErgebnis> {
  const ergebnis = await fuehreAus(async () => {
    const { kontext, db, t } = await schreibKontext();
    const d = await db.dokument.findFirst({ where: { id, ...dokumentFilter(await sichtbarkeit(kontext)) }, select: { speicherPfad: true } });
    if (!d) throw new EingabeFehler(t.fehler.unbekannt);
    await db.dokument.delete({ where: { id } });
    await entferne(d.speicherPfad);
  });
  if (ergebnis.fehler) return ergebnis;
  redirect("/import/dokumente");
}

/** Gibt ein Dokument für die Investoren der zugeordneten Gesellschaft frei bzw. nimmt die Freigabe zurück. */
export async function investorFreigabeSetzen(id: string, freigeben: boolean): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { kontext, db, t } = await schreibKontext();
    const d = await db.dokument.findFirst({ where: { id, ...dokumentFilter(await sichtbarkeit(kontext)) }, select: { bestaetigt: true, gesellschaftId: true, hausId: true, kreditId: true } });
    if (!d) throw new EingabeFehler(t.fehler.unbekannt);
    if (freigeben && (!d.bestaetigt || !(d.gesellschaftId || d.hausId || d.kreditId))) throw new EingabeFehler(t.dateien.investorNurBestaetigt);
    await db.dokument.update({ where: { id }, data: freigeben ? { investorFreigabeAm: new Date(), investorFreigabeVon: kontext.benutzer.name } : { investorFreigabeAm: null, investorFreigabeVon: null } });
    refresh();
    return { ok: t.allgemein.gespeichert };
  });
}
