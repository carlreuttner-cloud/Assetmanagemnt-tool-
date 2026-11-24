"use server";

import { refresh } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { alsDbDatum, plusTage } from "@/lib/datum";
import { ladeRechengrundlage } from "@/lib/daten/portfolio";
import { dezimal, zuText } from "@/lib/geld";
import { EingabeFehler, formularLeser, fuehreAus, type AktionsErgebnis } from "@/lib/formular";
import { berechneTilgungsplan, restschuld, type TilgungsartArt, type ZahlweiseArt } from "@/lib/kredit";

const ZINSARTEN = ["FEST", "VARIABEL"] as const;
const ZAHLWEISEN = ["MONATLICH", "QUARTALSWEISE", "HALBJAEHRLICH", "JAEHRLICH"] as const satisfies readonly ZahlweiseArt[];
const TILGUNGSARTEN = ["ANNUITAET", "RATENTILGUNG", "ENDFAELLIG"] as const satisfies readonly TilgungsartArt[];
const VERGLEICHE = ["HOECHSTENS", "MINDESTENS"] as const;
const BUCHUNGSARTEN = ["ZINS", "TILGUNG", "SONDERTILGUNG", "GEBUEHR", "AUSZAHLUNG", "SONSTIGES"] as const;

async function schreibKontext() {
  const kontext = await pruefeZugriff("gesellschaften", "schreiben");
  return { kontext, db: kontext.db, t: texte(kontext.mandant.sprache), sprache: kontext.mandant.sprache };
}

// ---------------------------------------------------------------------------
// Gesellschaften
// ---------------------------------------------------------------------------

export async function gesellschaftSpeichern(id: string | null, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  let ziel = id;
  const ergebnis = await fuehreAus(async () => {
    const { db, t, sprache } = await schreibKontext();
    const f = formularLeser(fd, sprache);
    const daten = {
      name: f.pflicht("name", t.gesellschaften.name),
      rechtsform: f.text("rechtsform"),
      registernummer: f.text("registernummer"),
      steuernummer: f.text("steuernummer"),
      notiz: f.text("notiz"),
    };
    if (id) await db.gesellschaft.update({ where: { id }, data: daten });
    else ziel = (await db.gesellschaft.create({ data: daten as never })).id;
  });
  if (ergebnis.fehler) return ergebnis;
  redirect(`/gesellschaften/${ziel}`);
}

export async function gesellschaftLoeschen(id: string): Promise<AktionsErgebnis> {
  const ergebnis = await fuehreAus(async () => {
    const { db, t } = await schreibKontext();
    const [haeuser, kredite] = await Promise.all([db.haus.count({ where: { gesellschaftId: id } }), db.kredit.count({ where: { gesellschaftId: id } })]);
    if (haeuser + kredite > 0) throw new EingabeFehler(t.gesellschaften.loeschenNichtMoeglich);
    await db.gesellschaft.delete({ where: { id } });
  });
  if (ergebnis.fehler) return ergebnis;
  redirect("/gesellschaften");
}

// ---------------------------------------------------------------------------
// Kredite
// ---------------------------------------------------------------------------

export async function kreditSpeichern(id: string | null, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  let ziel = id;
  const ergebnis = await fuehreAus(async () => {
    const { db, t, sprache } = await schreibKontext();
    const f = formularLeser(fd, sprache);
    const k = t.kredite;
    const zinsArt = f.auswahl("zinsArt", k.zinsArt, ZINSARTEN);
    const sollzins = f.prozentOptional("sollzins", k.sollzins);
    const referenzzins = f.text("referenzzins");
    const marge = f.prozentOptional("marge", k.marge);
    if (zinsArt === "FEST" && !sollzins) throw new EingabeFehler(k.sollzinsFehlt);
    if (zinsArt === "VARIABEL" && (!referenzzins || !marge)) throw new EingabeFehler(k.referenzFehlt);

    const daten = {
      gesellschaftId: f.pflicht("gesellschaftId", k.gesellschaft),
      bezeichnung: f.pflicht("bezeichnung", k.bezeichnung),
      bank: f.text("bank"),
      kreditnummer: f.text("kreditnummer"),
      iban: f.text("iban")?.replace(/\s/g, "").toUpperCase() ?? null,
      ursprungsbetrag: zuText(f.betrag("ursprungsbetrag", k.ursprungsbetrag))!,
      auszahlungsdatum: datumOderNull(f.datumOptional("auszahlungsdatum", k.auszahlungsdatum)),
      zinsArt,
      sollzins: zinsArt === "FEST" ? zuText(sollzins) : null,
      referenzzins: zinsArt === "VARIABEL" ? referenzzins : null,
      marge: zinsArt === "VARIABEL" ? zuText(marge) : null,
      zinsbindungBis: datumOderNull(f.datumOptional("zinsbindungBis", k.zinsbindungBis)),
      laufzeitBis: datumOderNull(f.datumOptional("laufzeitBis", k.laufzeitBis)),
      zahlweise: f.auswahl("zahlweise", k.zahlweise, ZAHLWEISEN),
      tilgungsart: f.auswahl("tilgungsart", k.tilgungsart, TILGUNGSARTEN),
      anfaenglicheTilgung: zuText(f.prozentOptional("anfaenglicheTilgung", k.anfaenglicheTilgung)),
      ratenbetrag: zuText(f.betragOptional("ratenbetrag", k.ratenbetrag)),
      notiz: f.text("notiz"),
    };

    // Anteile je Haus: Felder "anteil:<hausId>"
    const anteile: Array<{ hausId: string; anteilProzent: string }> = [];
    let summe = dezimal(0);
    for (const [schluessel] of fd.entries()) {
      if (!schluessel.startsWith("anteil:")) continue;
      const wert = f.prozentOptional(schluessel, k.anteil);
      if (!wert || wert.isZero()) continue;
      anteile.push({ hausId: schluessel.slice("anteil:".length), anteilProzent: zuText(wert)! });
      summe = summe.plus(wert);
    }
    if (anteile.length > 0 && !summe.equals(100)) {
      throw new EingabeFehler(fuelle(k.anteilSumme, { summe: summe.toFixed().replace(".", ",") }));
    }

    if (id) {
      await db.kredit.update({ where: { id }, data: daten });
      await db.kreditHaus.deleteMany({ where: { kreditId: id } });
    } else {
      ziel = (await db.kredit.create({ data: daten as never })).id;
    }
    for (const a of anteile) await db.kreditHaus.create({ data: { kreditId: ziel!, ...a } as never });
  });
  if (ergebnis.fehler) return ergebnis;
  redirect(`/gesellschaften/kredite/${ziel}`);
}

function datumOderNull(wert: string | null) {
  return wert ? alsDbDatum(wert) : null;
}

export async function kreditLoeschen(id: string): Promise<AktionsErgebnis> {
  let gesellschaftId = "";
  const ergebnis = await fuehreAus(async () => {
    const { db, t } = await schreibKontext();
    const kredit = await db.kredit.findUnique({
      where: { id },
      select: { gesellschaftId: true, _count: { select: { buchungen: true, tilgungsplaene: true } } },
    });
    if (!kredit) notFound();
    if (kredit._count.buchungen + kredit._count.tilgungsplaene > 0) throw new EingabeFehler(t.kredite.loeschenNichtMoeglich);
    gesellschaftId = kredit.gesellschaftId;
    await db.kreditHaus.deleteMany({ where: { kreditId: id } });
    await db.covenant.deleteMany({ where: { kreditId: id } });
    await db.kredit.delete({ where: { id } });
  });
  if (ergebnis.fehler) return ergebnis;
  redirect(`/gesellschaften/${gesellschaftId}`);
}

// ---------------------------------------------------------------------------
// Covenants, Buchungen, Tilgungspläne
// ---------------------------------------------------------------------------

export async function covenantHinzufuegen(kreditId: string, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { db, t, sprache } = await schreibKontext();
    const f = formularLeser(fd, sprache);
    const vergleich = f.text("vergleich");
    await db.covenant.create({
      data: {
        kreditId,
        kennzahl: f.pflicht("kennzahl", t.kredite.kennzahl).toUpperCase(),
        vergleich: VERGLEICHE.find((v) => v === vergleich) ?? null,
        schwellenwert: zuText(f.zahlOptional("schwellenwert", t.kredite.schwellenwert)),
        pruefrhythmus: f.text("pruefrhythmus"),
        beschreibung: f.text("beschreibung"),
      } as never,
    });
    refresh();
    return { ok: t.allgemein.gespeichert };
  });
}

export async function covenantLoeschen(id: string): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { db } = await schreibKontext();
    await db.covenant.delete({ where: { id } });
    refresh();
  });
}

export async function buchungHinzufuegen(kreditId: string, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { db, t, sprache } = await schreibKontext();
    const f = formularLeser(fd, sprache);
    const betrag = f.betrag("betrag", t.allgemein.betrag);
    await db.kreditbuchung.create({
      data: {
        kreditId,
        datum: alsDbDatum(f.datum("datum", t.allgemein.datum)),
        art: f.auswahl("art", t.kredite.art, BUCHUNGSARTEN),
        betrag: zuText(betrag.abs()),
        saldoNach: zuText(f.betragOptional("saldoNach", t.kredite.saldoNach)?.abs()),
        notiz: f.text("notiz"),
      } as never,
    });
    refresh();
    return { ok: t.allgemein.gespeichert };
  });
}

export async function buchungLoeschen(id: string): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { db } = await schreibKontext();
    await db.kreditbuchung.delete({ where: { id } });
    refresh();
  });
}

const SALDOARTEN = ["DARLEHEN", "GUTHABEN"] as const;
const SALDOQUELLEN = ["KONTOAUSZUG", "BANKBESTAETIGUNG", "JAHRESABSCHLUSS", "SONSTIGE"] as const;
const SALDOSTATUS = ["BELEGT", "ENTWURF"] as const;

/** Belegten Saldo (Restschuld oder Guthaben) zu einem Kredit erfassen. */
export async function saldoHinzufuegen(kreditId: string, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { db, t, sprache } = await schreibKontext();
    const f = formularLeser(fd, sprache);
    const k = t.kredite;
    if (!(await db.kredit.findFirst({ where: { id: kreditId }, select: { id: true } }))) notFound();
    const stichtag = f.datumOptional("stichtag", k.saldoStichtag);
    const stichtagHinweis = f.text("stichtagHinweis");
    if (!stichtag && !stichtagHinweis) throw new EingabeFehler(k.saldoStichtagFehlt);
    const betrag = f.betrag("betrag", t.allgemein.betrag);
    if (betrag.isNegative()) throw new EingabeFehler(k.saldoBetragFehlt);
    await db.kreditsaldo.create({
      data: {
        kreditId,
        stichtag: stichtag ? alsDbDatum(stichtag) : null,
        stichtagHinweis: stichtag ? null : stichtagHinweis,
        art: f.auswahl("art", k.saldoArt, SALDOARTEN),
        betrag: zuText(betrag),
        quelle: f.auswahl("quelle", k.saldoQuelle, SALDOQUELLEN),
        quelleText: f.text("quelleText"),
        status: f.auswahl("status", k.saldoStatus, SALDOSTATUS),
        notiz: f.text("notiz"),
      } as never,
    });
    refresh();
    return { ok: k.saldoGespeichert };
  });
}

export async function saldoLoeschen(id: string): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { db } = await schreibKontext();
    await db.kreditsaldo.delete({ where: { id } });
    refresh();
  });
}

export async function tilgungsplanBerechnen(kreditId: string, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  let version = 0;
  const ergebnis = await fuehreAus(async () => {
    const { db, t, sprache, kontext } = await schreibKontext();
    const f = formularLeser(fd, sprache);
    const k = t.kredite;
    const ab = f.datum("ab", k.gueltigAb);
    const grundlage = await ladeRechengrundlage(kontext, { kreditId });
    const kredit = grundlage.kredite[0];
    if (!kredit) notFound();
    // Ohne Eingabe nur die belegte Restschuld zum Vortag, nie ein Schätzwert.
    const saldo = f.betragOptional("saldo", k.planStartsaldo) ?? restschuld(kredit, plusTage(ab, -1));
    if (saldo === null) throw new EingabeFehler(k.planStartsaldoFehlt);
    const zeilen = berechneTilgungsplan({
      saldo,
      ab,
      zinssatz: f.prozent("zinssatz", k.zins),
      zahlweise: f.auswahl("zahlweise", k.zahlweise, ZAHLWEISEN),
      tilgungsart: f.auswahl("tilgungsart", k.tilgungsart, TILGUNGSARTEN),
      ratenbetrag: f.betragOptional("ratenbetrag", k.ratenbetrag),
      tilgungProzent: f.prozentOptional("tilgungProzent", k.anfaenglicheTilgung),
      bis: f.datumOptional("bis", k.planBis),
    });
    if (zeilen.length === 0) throw new EingabeFehler(k.planLeer);

    const letzte = await db.tilgungsplan.findFirst({ where: { kreditId }, orderBy: { version: "desc" }, select: { version: true } });
    version = (letzte?.version ?? 0) + 1;
    const plan = await db.tilgungsplan.create({
      data: { kreditId, version, gueltigAb: alsDbDatum(ab), bezeichnung: f.text("bezeichnung") } as never,
    });
    await db.tilgungsplanZeile.createMany({
      data: zeilen.map((z) => ({
        tilgungsplanId: plan.id,
        faelligAm: alsDbDatum(z.faelligAm),
        zins: zuText(z.zins)!,
        tilgung: zuText(z.tilgung)!,
        rate: zuText(z.rate)!,
        restschuld: zuText(z.restschuld)!,
      })) as never,
    });
  });
  if (ergebnis.fehler) return ergebnis;
  redirect(`/gesellschaften/kredite/${kreditId}?plan=${version}#tilgungsplaene`);
}

/** Nur die jeweils neueste Version kann gelöscht werden (zum Korrigieren von Fehleingaben). */
export async function tilgungsplanLoeschen(kreditId: string, planId: string): Promise<AktionsErgebnis> {
  const ergebnis = await fuehreAus(async () => {
    const { db } = await schreibKontext();
    const letzte = await db.tilgungsplan.findFirst({ where: { kreditId }, orderBy: { version: "desc" }, select: { id: true } });
    if (letzte?.id !== planId) notFound();
    await db.tilgungsplanZeile.deleteMany({ where: { tilgungsplanId: planId } });
    await db.tilgungsplan.delete({ where: { id: planId } });
  });
  if (ergebnis.fehler) return ergebnis;
  redirect(`/gesellschaften/kredite/${kreditId}#tilgungsplaene`);
}

// ---------------------------------------------------------------------------
// Referenzzinsen
// ---------------------------------------------------------------------------

export async function referenzzinsSpeichern(_v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { db, t, sprache } = await schreibKontext();
    const f = formularLeser(fd, sprache);
    const r = t.referenzzinsen;
    const referenz = f.pflicht("referenz", r.referenz).toUpperCase();
    const stichtag = alsDbDatum(f.datum("stichtag", t.allgemein.stichtag));
    const satz = zuText(f.prozent("satz", r.satz))!;
    const quelle = f.text("quelle");
    const vorhanden = await db.referenzzinssatz.findFirst({ where: { referenz, stichtag }, select: { id: true } });
    if (vorhanden) await db.referenzzinssatz.update({ where: { id: vorhanden.id }, data: { satz, quelle } });
    else await db.referenzzinssatz.create({ data: { referenz, stichtag, satz, quelle } as never });
    refresh();
    return { ok: t.allgemein.gespeichert };
  });
}

export async function referenzzinsLoeschen(id: string): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { db } = await schreibKontext();
    await db.referenzzinssatz.delete({ where: { id } });
    refresh();
  });
}
