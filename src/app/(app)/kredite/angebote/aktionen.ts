"use server";

import { refresh } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { kombiniereAngebotKi, leseAngebot, type AngebotVorschlag } from "@/lib/bankangebot";
import { alsDbDatum, istIsoDatum } from "@/lib/datum";
import { angebotFilter } from "@/lib/daten/bankangebote";
import { EingabeFehler, formularLeser, fuehreAus, type AktionsErgebnis } from "@/lib/formular";
import { dezimal } from "@/lib/geld";
import { KiFehler, fuehreAngebotsErkennungDurch, kiModus } from "@/lib/ki-claude";

const ZINSARTEN = ["FEST", "VARIABEL"] as const;
const ZAHLWEISEN = ["MONATLICH", "QUARTALSWEISE", "HALBJAEHRLICH", "JAEHRLICH"] as const;
const TILGUNGSARTEN = ["ANNUITAET", "RATENTILGUNG", "ENDFAELLIG"] as const;

async function schreibKontext() {
  const kontext = await pruefeZugriff("gesellschaften", "schreiben");
  const sicht = await sichtbarkeit(kontext);
  return { kontext, db: kontext.db, sicht, t: texte(kontext.mandant.sprache) };
}

/** Werte des Vorschlags (Text) in Datenbankfelder; nur gültige Werte, sonst leer. */
function datenAusVorschlag(v: AngebotVorschlag) {
  const zahl = (k: keyof AngebotVorschlag) => (v[k] && /^-?\d+(\.\d+)?$/.test(v[k]!.wert) ? dezimal(v[k]!.wert) : null);
  const ganz = (k: keyof AngebotVorschlag) => (v[k] && /^\d{1,4}$/.test(v[k]!.wert) ? Number(v[k]!.wert) : null);
  const datum = (k: keyof AngebotVorschlag) => (v[k] && istIsoDatum(v[k]!.wert) ? alsDbDatum(v[k]!.wert) : null);
  return {
    betrag: zahl("betrag"),
    zinsArt: v.zinsArt?.wert === "VARIABEL" ? ("VARIABEL" as const) : ("FEST" as const),
    sollzins: zahl("sollzins"),
    referenzzins: v.referenzzins?.wert.slice(0, 40) ?? null,
    marge: zahl("marge"),
    zinsbindungMonate: ganz("zinsbindungMonate"),
    laufzeitMonate: ganz("laufzeitMonate"),
    tilgungProzent: zahl("tilgungProzent"),
    auszahlungProzent: zahl("auszahlungProzent"),
    bearbeitungsgebuehr: zahl("bearbeitungsgebuehr"),
    sonstigeKosten: zahl("sonstigeKosten"),
    bereitstellungszins: zahl("bereitstellungszins"),
    bereitstellungsfreiMonate: ganz("bereitstellungsfreiMonate"),
    sondertilgungProzent: zahl("sondertilgungProzent"),
    covenants: v.covenants?.wert ?? null,
    sicherheiten: v.sicherheiten?.wert ?? null,
    angebotVom: datum("angebotVom"),
    gueltigBis: datum("gueltigBis"),
  };
}

/** Liest ein Dokument der Dateiablage aus und legt einen Entwurf an (nichts wird bestätigt). */
export async function angebotAuslesen(_v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  let ziel: string | null = null;
  const ergebnis = await fuehreAus(async () => {
    const { kontext, db, t } = await schreibKontext();
    const tb = t.bankangebote;
    const dokumentId = formularLeser(fd, kontext.mandant.sprache).pflicht("dokumentId", tb.dokument);
    const dok = await db.dokument.findFirst({ where: { id: dokumentId }, select: { id: true, titel: true, absenderName: true, seiten: { orderBy: { nummer: "asc" }, select: { text: true } } } });
    if (!dok) throw new EingabeFehler(fuelle(t.fehler.pflichtfeld, { feld: tb.dokument }));
    const text = dok.seiten.map((s) => s.text).join("\n");
    if (!text.trim()) throw new EingabeFehler(tb.keineDokumente);
    const banken = (await db.kredit.findMany({ where: { bank: { not: null } }, distinct: ["bank"], select: { bank: true } })).map((k) => k.bank!);
    if (dok.absenderName) banken.push(dok.absenderName);
    let vorschlag = leseAngebot(text, banken);
    let kiModell: string | null = null;
    if (kiModus() === "claude") {
      try {
        const ki = await fuehreAngebotsErkennungDurch(text, t);
        vorschlag = kombiniereAngebotKi(vorschlag, ki.felder, text);
        kiModell = ki.modell;
      } catch (e) {
        // Ohne KI weiter; die Regel-Werte genügen als Vorschlag
        if (!(e instanceof KiFehler)) console.error(e);
      }
    }
    const bank = vorschlag.bank?.wert ?? dok.absenderName ?? dok.titel;
    const neu = await db.bankangebot.create({
      data: { bank: bank.slice(0, 200), dokumentId: dok.id, ...datenAusVorschlag(vorschlag), vorschlag: vorschlag as never, kiModell, erstelltVonId: kontext.benutzer.id } as never,
      select: { id: true },
    });
    ziel = neu.id;
  });
  if (ergebnis.fehler || !ziel) return ergebnis;
  redirect(`/kredite/angebote/${ziel}`);
}

export async function angebotAnlegen(_v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  let ziel: string | null = null;
  const ergebnis = await fuehreAus(async () => {
    const { kontext, db, t } = await schreibKontext();
    const bank = formularLeser(fd, kontext.mandant.sprache).pflicht("bank", t.bankangebote.felder.bank).slice(0, 200);
    const neu = await db.bankangebot.create({ data: { bank, erstelltVonId: kontext.benutzer.id } as never, select: { id: true } });
    ziel = neu.id;
  });
  if (ergebnis.fehler || !ziel) return ergebnis;
  redirect(`/kredite/angebote/${ziel}`);
}

/** Speichert die geprüften Werte; mit dem Knopf „bestätigen“ kommt das Angebot in den Vergleich. */
export async function angebotSpeichern(id: string, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const bestaetigen = fd.get("modus") === "bestaetigen";
  return fuehreAus(async () => {
    const { kontext, db, sicht, t } = await schreibKontext();
    const tf = t.bankangebote.felder;
    const vorhanden = await db.bankangebot.findFirst({ where: { id, ...angebotFilter(sicht) }, select: { id: true } });
    if (!vorhanden) notFound();
    const f = formularLeser(fd, kontext.mandant.sprache);
    const ganz = (name: string, feld: string) => {
      const w = f.text(name);
      if (!w) return null;
      if (!/^\d{1,4}$/.test(w)) throw new EingabeFehler(fuelle(t.bankangebote.fehlerGanzzahl, { feld }));
      return Number(w);
    };
    const gesellschaftId = f.text("gesellschaftId");
    if (gesellschaftId && sicht.gesellschaftIds !== "alle" && !sicht.gesellschaftIds.includes(gesellschaftId)) throw new EingabeFehler(fuelle(t.fehler.pflichtfeld, { feld: tf.gesellschaft }));
    const kreditId = f.text("kreditId");
    const dbDatum = (w: string | null) => (w ? alsDbDatum(w) : null);
    const daten = {
      bank: f.pflicht("bank", tf.bank).slice(0, 200),
      bezeichnung: f.text("bezeichnung")?.slice(0, 200) ?? null,
      gesellschaftId,
      kreditId,
      angebotVom: dbDatum(f.datumOptional("angebotVom", tf.angebotVom)),
      gueltigBis: dbDatum(f.datumOptional("gueltigBis", tf.gueltigBis)),
      betrag: f.betragOptional("betrag", tf.betrag),
      zinsArt: f.auswahl("zinsArt", tf.zinsArt, ZINSARTEN),
      sollzins: f.prozentOptional("sollzins", tf.sollzins),
      referenzzins: f.text("referenzzins")?.toUpperCase().slice(0, 40) ?? null,
      marge: f.prozentOptional("marge", tf.marge),
      zinsbindungMonate: ganz("zinsbindungMonate", tf.zinsbindungMonate),
      laufzeitMonate: ganz("laufzeitMonate", tf.laufzeitMonate),
      zahlweise: f.auswahl("zahlweise", tf.zahlweise, ZAHLWEISEN),
      tilgungsart: f.auswahl("tilgungsart", tf.tilgungsart, TILGUNGSARTEN),
      tilgungProzent: f.prozentOptional("tilgungProzent", tf.tilgungProzent),
      auszahlungProzent: f.prozentOptional("auszahlungProzent", tf.auszahlungProzent),
      bearbeitungsgebuehr: f.betragOptional("bearbeitungsgebuehr", tf.bearbeitungsgebuehr),
      sonstigeKosten: f.betragOptional("sonstigeKosten", tf.sonstigeKosten),
      bereitstellungszins: f.prozentOptional("bereitstellungszins", tf.bereitstellungszins),
      bereitstellungsfreiMonate: ganz("bereitstellungsfreiMonate", tf.bereitstellungsfreiMonate),
      sondertilgungProzent: f.prozentOptional("sondertilgungProzent", tf.sondertilgungProzent),
      covenants: f.text("covenants")?.slice(0, 2000) ?? null,
      sicherheiten: f.text("sicherheiten")?.slice(0, 2000) ?? null,
      notiz: f.text("notiz")?.slice(0, 2000) ?? null,
      status: bestaetigen ? ("BESTAETIGT" as const) : ("ENTWURF" as const),
      bestaetigtVonId: bestaetigen ? kontext.benutzer.id : null,
      bestaetigtAm: bestaetigen ? new Date() : null,
    };
    await db.bankangebot.update({ where: { id }, data: daten as never });
    refresh();
    return { ok: bestaetigen ? t.bankangebote.stati.BESTAETIGT : t.bankangebote.stati.ENTWURF };
  });
}

export async function angebotLoeschen(id: string): Promise<AktionsErgebnis> {
  const ergebnis = await fuehreAus(async () => {
    const { db, sicht } = await schreibKontext();
    await db.bankangebot.deleteMany({ where: { id, ...angebotFilter(sicht) } });
  });
  if (ergebnis.fehler) return ergebnis;
  redirect("/kredite/angebote");
}

