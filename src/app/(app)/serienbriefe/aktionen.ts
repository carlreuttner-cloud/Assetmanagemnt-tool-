"use server";

import { createHash } from "node:crypto";
import { refresh } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { speichere } from "@/lib/dateispeicher";
import { alsDbDatum, heute } from "@/lib/datum";
import { istBereit, ladeEmpfaenger, leseSerie } from "@/lib/daten/serienbrief";
import { formatierer } from "@/lib/format";
import { EingabeFehler, formularLeser, fuehreAus, type AktionsErgebnis } from "@/lib/formular";
import { zuText } from "@/lib/geld";
import { serienbriefPdf } from "@/lib/pdf/serienbrief";
import { unbekanntePlatzhalter } from "@/lib/serienbrief";

const ARTEN = ["MIETERHOEHUNG", "ALLGEMEIN"] as const;

/** Vorlage anlegen oder (mit Feld „id“) ändern. */
export async function vorlageSpeichern(_v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const kontext = await pruefeZugriff("mieter", "schreiben");
    const t = texte(kontext.mandant.sprache);
    const ts = t.serienbriefe;
    const f = formularLeser(fd, kontext.mandant.sprache);
    const daten = { name: f.pflicht("name", ts.name), art: f.auswahl("art", ts.art, ARTEN), betreff: f.pflicht("betreff", ts.betreff), text: f.pflicht("text", ts.text) };
    const falsch = unbekanntePlatzhalter(`${daten.betreff}\n${daten.text}`);
    if (falsch.length) throw new EingabeFehler(fuelle(ts.platzhalterUnbekannt, { namen: falsch.join(", ") }));
    const id = f.text("id");
    if (id) {
      const v = await kontext.db.briefvorlage.findFirst({ where: { id }, select: { id: true } });
      if (!v) notFound();
      await kontext.db.briefvorlage.update({ where: { id }, data: daten });
    } else {
      await kontext.db.briefvorlage.create({ data: { ...daten, erstelltVon: kontext.benutzer.name } as never });
    }
    refresh();
    return { ok: t.allgemein.gespeichert };
  });
}

export async function vorlageLoeschen(id: string): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const kontext = await pruefeZugriff("mieter", "schreiben");
    const { count } = await kontext.db.briefvorlage.deleteMany({ where: { id } });
    if (count === 0) notFound();
    refresh();
  });
}

/**
 * Erstellt je ausgewähltem Empfänger einen Brief als PDF und legt ihn als Dokument beim
 * Mietverhältnis ab. Briefe mit fehlenden Werten werden nicht erstellt.
 */
export async function serieErstellen(_v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  let serieId: string | null = null;
  const ergebnis = await fuehreAus(async () => {
    const kontext = await pruefeZugriff("mieter", "schreiben");
    const t = texte(kontext.mandant.sprache);
    const ts = t.serienbriefe;
    if (!darf(kontext.rolle, "dokumente", "schreiben")) throw new EingabeFehler(ts.keinRechtDokumente);
    const f = formularLeser(fd, kontext.mandant.sprache);
    const fmt = formatierer(kontext.mandant);
    const { fehler, vorlage, parameter } = await leseSerie(kontext, { vorlage: f.text("vorlage"), haus: f.text("haus"), gesellschaft: f.text("gesellschaft"), prozent: f.text("prozent"), betrag: f.text("betrag"), datum: f.text("datum") }, heute());
    if (fehler || !vorlage || !parameter) throw new EingabeFehler(ts.fehler[fehler ?? "vorlage"]);
    const auswahl = fd.getAll("mv").map(String);
    if (auswahl.length === 0) throw new EingabeFehler(ts.keineAuswahl);
    const empfaenger = (await ladeEmpfaenger(kontext, { ...parameter, nur: auswahl }, fmt, ts.fehlt)).filter(istBereit);
    if (empfaenger.length === 0) throw new EingabeFehler(ts.keineBereit);
    const serie = await kontext.db.briefserie.create({
      data: {
        briefvorlageId: vorlage.id,
        art: vorlage.art,
        titel: fuelle(ts.serieTitel, { vorlage: vorlage.name, datum: fmt.datum(parameter.datum) }),
        datum: alsDbDatum(parameter.datum),
        betreff: vorlage.betreff,
        text: vorlage.text,
        prozent: zuText(parameter.prozent),
        betrag: zuText(parameter.betrag),
        erstelltVon: kontext.benutzer.name,
      } as never,
    });
    const kategorie = vorlage.art === "MIETERHOEHUNG" ? ts.kategorieMieterhoehung : ts.kategorieSchreiben;
    for (const e of empfaenger) {
      const daten = await serienbriefPdf(e.betreff, [{ absender: e.gesellschaft, anschrift: e.anschrift!, ort: null, datum: fmt.datum(parameter.datum), betreff: e.betreff, text: e.text }], {
        fuss: () => fuelle(ts.pdfFuss, { serie: serie.titel }),
      });
      const speicherPfad = await speichere(kontext.mandant.id, "dokumente", "pdf", daten);
      const dok = await kontext.db.dokument.create({
        data: {
          titel: `${kategorie} – ${e.mieter} (${e.einheit})`,
          kategorie,
          jahr: Number(parameter.datum.slice(0, 4)),
          dokumentDatum: alsDbDatum(parameter.datum),
          speicherPfad,
          dateiname: `${kategorie} ${e.einheit}.pdf`,
          mimeType: "application/pdf",
          groesseBytes: daten.length,
          pruefsumme: createHash("sha256").update(daten).digest("hex"),
          absenderName: e.gesellschaft,
          bestaetigt: true,
          textQuelle: "PDF_TEXT",
          seitenAnzahl: 1,
          hochgeladenVonId: kontext.benutzer.id,
          hausId: e.hausId,
          einheitId: e.einheitId,
          mietverhaeltnisId: e.mietverhaeltnisId,
          briefserieId: serie.id,
        } as never,
      });
      await kontext.db.dokumentSeite.create({ data: { dokumentId: dok.id, nummer: 1, text: `${e.betreff}\n\n${e.text}` } as never });
    }
    serieId = serie.id;
  });
  if (serieId) redirect(`/serienbriefe?serie=${serieId}`);
  return ergebnis;
}
