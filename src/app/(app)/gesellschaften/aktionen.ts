"use server";

import { refresh } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { fuelle, texte, type Texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { TEST_INTERVALLE } from "@/lib/covenant-nachweis";
import { alsDbDatum, heute, plusTage } from "@/lib/datum";
import { baueCovenantNachweis } from "@/lib/daten/covenant-nachweis";
import { erlaubt, ladeRechengrundlage } from "@/lib/daten/portfolio";
import { dezimal, zuText } from "@/lib/geld";
import { ALLE_POSTEN } from "@/lib/finanzen";
import { EingabeFehler, formularLeser, fuehreAus, type AktionsErgebnis } from "@/lib/formular";
import { berechneTilgungsplan, restschuld, type TilgungsartArt, type ZahlweiseArt } from "@/lib/kredit";

const ZINSARTEN = ["FEST", "VARIABEL"] as const;
const ZAHLWEISEN = ["MONATLICH", "QUARTALSWEISE", "HALBJAEHRLICH", "JAEHRLICH"] as const satisfies readonly ZahlweiseArt[];
const TILGUNGSARTEN = ["ANNUITAET", "RATENTILGUNG", "ENDFAELLIG"] as const satisfies readonly TilgungsartArt[];
const VERGLEICHE = ["HOECHSTENS", "MINDESTENS"] as const;
const FOLGEN = ["COVENANT", "AUSSCHUETTUNGSSPERRE"] as const;
const ABSCHLUSS_QUELLEN = ["JAHRESABSCHLUSS", "BWA", "SONSTIGE"] as const;
const ABSCHLUSS_STATUS = ["ENDGUELTIG", "ENTWURF"] as const;
const ST_RECHTE = ["UNBEKANNT", "KEINES", "PROZENT", "BETRAG"] as const;
const ST_JAHRE = ["KALENDERJAHR", "VERTRAGSJAHR"] as const;
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
      portfolioId: f.text("portfolioId"),
    };
    if (daten.portfolioId && (await db.portfolio.count({ where: { id: daten.portfolioId } })) === 0) throw new EingabeFehler(fuelle(t.fehler.pflichtfeld, { feld: t.gesellschaften.portfolio }));
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
        folge: f.auswahl("folge", t.kredite.folge, FOLGEN),
        kennzahl: f.pflicht("kennzahl", t.kredite.kennzahl).toUpperCase(),
        vergleich: VERGLEICHE.find((v) => v === vergleich) ?? null,
        schwellenwert: zuText(f.zahlOptional("schwellenwert", t.kredite.schwellenwert)),
        pruefrhythmus: f.text("pruefrhythmus"),
        ...testTermin(f, t),
        beschreibung: f.text("beschreibung"),
      } as never,
    });
    refresh();
    return { ok: t.allgemein.gespeichert };
  });
}

/** Testtermine eines Covenants: erster Termin und Abstand in Monaten (beides oder nichts). */
function testTermin(f: ReturnType<typeof formularLeser>, t: Texte) {
  const erster = f.datumOptional("ersterTest", t.kredite.ersterTest);
  const intervall = TEST_INTERVALLE.find((m) => String(m) === f.text("testIntervallMonate")) ?? null;
  if ((erster === null) !== (intervall === null)) throw new EingabeFehler(t.kredite.testBeides);
  return { ersterTest: erster ? alsDbDatum(erster) : null, testIntervallMonate: intervall };
}

export async function covenantTestSetzen(id: string, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { db, t, sprache } = await schreibKontext();
    await db.covenant.update({ where: { id }, data: testTermin(formularLeser(fd, sprache), t) });
    refresh();
    return { ok: t.allgemein.gespeichert };
  });
}

/** Sondertilgungsrecht laut Vertrag; ohne Prozent oder Betrag nur „unbekannt“ oder „keines“. */
export async function sondertilgungSetzen(kreditId: string, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { db, t, sprache } = await schreibKontext();
    const ts = t.sondertilgung;
    const f = formularLeser(fd, sprache);
    const recht = f.auswahl("recht", ts.recht, ST_RECHTE);
    const wert = recht === "PROZENT" ? f.prozentOptional("wert", ts.wert) : recht === "BETRAG" ? f.betragOptional("wert", ts.wert) : null;
    if ((recht === "PROZENT" || recht === "BETRAG") && (!wert || !wert.greaterThan(0))) throw new EingabeFehler(ts.wertFehlt);
    const bis = f.datumOptional("bis", ts.bis);
    await db.kredit.update({
      where: { id: kreditId },
      data: {
        sondertilgungRecht: recht,
        sondertilgungWert: zuText(wert),
        sondertilgungJahr: f.auswahl("jahr", ts.jahr, ST_JAHRE),
        sondertilgungUebertragbar: fd.get("uebertragbar") === "on",
        sondertilgungBis: bis ? alsDbDatum(bis) : null,
      },
    });
    refresh();
    return { ok: t.allgemein.gespeichert };
  });
}

/** Friert den Nachweis zum Stichtag ein und öffnet das PDF. */
export async function covenantNachweisErstellen(kreditId: string, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const { kontext, db, t, sprache } = await schreibKontext();
  const ergebnis = await fuehreAus(async () => {
    const stichtag = formularLeser(fd, sprache).datumOptional("stichtag", t.covenantNachweis.stichtag);
    if (!stichtag || stichtag > heute()) throw new EingabeFehler(t.covenantNachweis.stichtagUngueltig);
    const inhalt = await baueCovenantNachweis(kontext, kreditId, stichtag);
    if (!inhalt) notFound();
    if (inhalt.covenants.length === 0) throw new EingabeFehler(t.covenantNachweis.keineCovenants);
    const n = await db.covenantNachweis.create({ data: { kreditId, stichtag: alsDbDatum(stichtag), inhalt: inhalt as never, erstelltVon: kontext.benutzer.name } as never, select: { id: true } });
    return { ok: n.id };
  });
  if (ergebnis.ok && !ergebnis.fehler) redirect(`/api/covenant-nachweis/${ergebnis.ok}`);
  return ergebnis;
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

// ---------------------------------------------------------------------------
// Finanzen je Geschäftsjahr
// ---------------------------------------------------------------------------

async function pruefeGesellschaft(kontext: Awaited<ReturnType<typeof schreibKontext>>["kontext"], gesellschaftId: string) {
  const sicht = await sichtbarkeit(kontext);
  const g = await kontext.db.gesellschaft.findFirst({ where: { id: erlaubt(sicht.gesellschaftIds, gesellschaftId) }, select: { id: true } });
  if (!g) notFound();
}

export async function geschaeftsjahrSpeichern(ort: { id: string | null; gesellschaftId: string }, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const ergebnis = await fuehreAus(async () => {
    const { kontext, db, t, sprache } = await schreibKontext();
    await pruefeGesellschaft(kontext, ort.gesellschaftId);
    const f = formularLeser(fd, sprache);
    const tf = t.finanzen;
    const jahrText = f.pflicht("jahr", tf.jahr);
    if (!/^\d{4}$/.test(jahrText)) throw new EingabeFehler(fuelle(t.fehler.zahl, { feld: tf.jahr }));
    const jahr = Number(jahrText);
    const beginn = f.datum("beginn", tf.beginn);
    const ende = f.datum("ende", tf.ende);
    if (ende <= beginn) throw new EingabeFehler(fuelle(t.fehler.datum, { feld: tf.ende }));
    const daten: Record<string, unknown> = {
      jahr,
      beginn: alsDbDatum(beginn),
      ende: alsDbDatum(ende),
      quelle: f.auswahl("quelle", tf.quelle, ABSCHLUSS_QUELLEN),
      quelleText: f.text("quelleText"),
      status: f.auswahl("status", tf.status, ABSCHLUSS_STATUS),
      notiz: f.text("notiz"),
    };
    for (const p of ALLE_POSTEN) daten[p] = zuText(f.betragOptional(p, tf.posten[p]));
    const doppelt = await db.geschaeftsjahr.findFirst({ where: { gesellschaftId: ort.gesellschaftId, jahr, NOT: ort.id ? { id: ort.id } : undefined }, select: { id: true } });
    if (doppelt) throw new EingabeFehler(tf.jahrVorhanden);
    if (ort.id) {
      const bisher = await db.geschaeftsjahr.findFirst({ where: { id: ort.id, gesellschaftId: ort.gesellschaftId }, select: { id: true } });
      if (!bisher) notFound();
      await db.geschaeftsjahr.update({ where: { id: ort.id }, data: daten as never });
    } else {
      await db.geschaeftsjahr.create({ data: { ...daten, gesellschaftId: ort.gesellschaftId } as never });
    }
  });
  if (ergebnis.fehler) return ergebnis;
  redirect(`/gesellschaften/${ort.gesellschaftId}/finanzen`);
}

export async function geschaeftsjahrLoeschen(id: string, gesellschaftId: string): Promise<AktionsErgebnis> {
  const ergebnis = await fuehreAus(async () => {
    const { kontext, db } = await schreibKontext();
    await pruefeGesellschaft(kontext, gesellschaftId);
    const j = await db.geschaeftsjahr.findFirst({ where: { id, gesellschaftId }, select: { id: true } });
    if (!j) notFound();
    await db.geschaeftsjahr.delete({ where: { id } });
  });
  if (ergebnis.fehler) return ergebnis;
  redirect(`/gesellschaften/${gesellschaftId}/finanzen`);
}

// ---------------------------------------------------------------------------
// Gesellschafter, Kapitalbewegungen und Verteilungsregeln (Waterfall)
// ---------------------------------------------------------------------------

const BEWEGUNGSARTEN = ["EINLAGE", "RUECKZAHLUNG", "AUSSCHUETTUNG"] as const;
const VERZINSUNGEN = ["EINFACH", "ZINSESZINS"] as const;

export async function gesellschafterSpeichern(gesellschaftId: string, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { kontext, db, t, sprache } = await schreibKontext();
    await pruefeGesellschaft(kontext, gesellschaftId);
    const f = formularLeser(fd, sprache);
    const tw = t.waterfall;
    await db.gesellschafter.create({
      data: {
        gesellschaftId,
        name: f.pflicht("name", tw.name),
        beteiligungProzent: zuText(f.prozentOptional("beteiligungProzent", tw.beteiligung)),
        gewinnanteilProzent: zuText(f.prozentOptional("gewinnanteilProzent", tw.gewinnanteil)),
        notiz: f.text("notiz"),
      } as never,
    });
    refresh();
    return { ok: t.allgemein.gespeichert };
  });
}

export async function gesellschafterAendern(ort: { id: string; gesellschaftId: string }, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { kontext, db, t, sprache } = await schreibKontext();
    await pruefeGesellschaft(kontext, ort.gesellschaftId);
    const f = formularLeser(fd, sprache);
    const tw = t.waterfall;
    const g = await db.gesellschafter.findFirst({ where: { id: ort.id, gesellschaftId: ort.gesellschaftId }, select: { id: true } });
    if (!g) notFound();
    await db.gesellschafter.update({
      where: { id: ort.id },
      data: {
        name: f.pflicht("name", tw.name),
        beteiligungProzent: zuText(f.prozentOptional("beteiligungProzent", tw.beteiligung)),
        gewinnanteilProzent: zuText(f.prozentOptional("gewinnanteilProzent", tw.gewinnanteil)),
        notiz: f.text("notiz"),
      },
    });
    refresh();
    return { ok: t.allgemein.gespeichert };
  });
}

export async function gesellschafterLoeschen(id: string, gesellschaftId: string): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { kontext, db } = await schreibKontext();
    await pruefeGesellschaft(kontext, gesellschaftId);
    const g = await db.gesellschafter.findFirst({ where: { id, gesellschaftId }, select: { id: true } });
    if (!g) notFound();
    await db.kapitalbewegung.deleteMany({ where: { gesellschafterId: id } });
    await db.gesellschafter.delete({ where: { id } });
    refresh();
  });
}

export async function bewegungHinzufuegen(ort: { gesellschafterId: string; gesellschaftId: string }, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { kontext, db, t, sprache } = await schreibKontext();
    await pruefeGesellschaft(kontext, ort.gesellschaftId);
    const g = await db.gesellschafter.findFirst({ where: { id: ort.gesellschafterId, gesellschaftId: ort.gesellschaftId }, select: { id: true } });
    if (!g) notFound();
    const f = formularLeser(fd, sprache);
    const tw = t.waterfall;
    const datum = f.datumOptional("datum", tw.datum);
    const betrag = f.betrag("betrag", tw.betrag);
    if (!betrag.greaterThan(0)) throw new EingabeFehler(fuelle(t.fehler.betrag, { feld: tw.betrag }));
    await db.kapitalbewegung.create({
      data: {
        gesellschafterId: ort.gesellschafterId,
        art: f.auswahl("art", tw.art, BEWEGUNGSARTEN),
        datum: datum ? alsDbDatum(datum) : null,
        betrag: zuText(betrag),
        quelle: f.text("quelle"),
        notiz: f.text("notiz"),
      } as never,
    });
    refresh();
    return { ok: t.allgemein.gespeichert };
  });
}

export async function bewegungLoeschen(id: string, gesellschaftId: string): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { kontext, db } = await schreibKontext();
    await pruefeGesellschaft(kontext, gesellschaftId);
    const b = await db.kapitalbewegung.findFirst({ where: { id, gesellschafter: { gesellschaftId } }, select: { id: true } });
    if (!b) notFound();
    await db.kapitalbewegung.delete({ where: { id } });
    refresh();
  });
}

export async function waterfallvertragSpeichern(gesellschaftId: string, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { kontext, db, t, sprache } = await schreibKontext();
    await pruefeGesellschaft(kontext, gesellschaftId);
    const f = formularLeser(fd, sprache);
    const tw = t.waterfall;
    const daten = {
      vorzugsrenditeProzent: zuText(f.prozent("vorzugsrenditeProzent", tw.vorzugsrendite))!,
      verzinsung: f.auswahl("verzinsung", tw.verzinsung, VERZINSUNGEN),
      ausschuettungenAnrechnen: fd.get("ausschuettungenAnrechnen") === "on",
      quelle: f.pflicht("quelle", tw.vertragQuelle),
      notiz: f.text("notiz"),
    };
    const bisher = await db.waterfallvertrag.findFirst({ where: { gesellschaftId }, select: { id: true } });
    if (bisher) await db.waterfallvertrag.update({ where: { id: bisher.id }, data: daten });
    else await db.waterfallvertrag.create({ data: { ...daten, gesellschaftId } as never });
    refresh();
    return { ok: t.allgemein.gespeichert };
  });
}

export async function waterfallvertragLoeschen(gesellschaftId: string): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { kontext, db } = await schreibKontext();
    await pruefeGesellschaft(kontext, gesellschaftId);
    await db.waterfallvertrag.deleteMany({ where: { gesellschaftId } });
    refresh();
  });
}

// ---------------------------------------------------------------------------
// Zinssicherungen (Cap, Swap) zu variablen Krediten
// ---------------------------------------------------------------------------

/** Variabler Kredit, der in der Sichtbarkeit liegt; sonst Eingabefehler. */
async function sichtbarerKredit(kontext: Awaited<ReturnType<typeof schreibKontext>>["kontext"], kreditId: string, t: Texte) {
  const sicht = await sichtbarkeit(kontext);
  const k = await kontext.db.kredit.findFirst({ where: { id: kreditId, gesellschaftId: erlaubt(sicht.gesellschaftIds) }, select: { id: true, zinsArt: true } });
  if (!k) throw new EingabeFehler(t.zinssicherungen.kreditFehlt);
  return k;
}

export async function zinssicherungHinzufuegen(kreditId: string, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { kontext, db, t, sprache } = await schreibKontext();
    const tz = t.zinssicherungen;
    const k = await sichtbarerKredit(kontext, kreditId, t);
    if (k.zinsArt !== "VARIABEL") throw new EingabeFehler(tz.nichtVariabel);
    const f = formularLeser(fd, sprache);
    const beginn = f.datum("beginn", tz.beginn);
    const ende = f.datum("ende", tz.ende);
    if (ende <= beginn) throw new EingabeFehler(tz.endeVorBeginn);
    const nominal = f.betragOptional("nominal", tz.nominal);
    if (nominal !== null && nominal.lessThanOrEqualTo(0)) throw new EingabeFehler(fuelle(t.fehler.betrag, { feld: tz.nominal }));
    await db.zinssicherung.create({
      data: {
        kreditId,
        art: f.auswahl("art", tz.art, ["CAP", "SWAP"] as const),
        satz: zuText(f.prozent("satz", tz.satz)),
        nominal: zuText(nominal),
        beginn: alsDbDatum(beginn),
        ende: alsDbDatum(ende),
        bank: f.text("bank"),
        praemie: zuText(f.betragOptional("praemie", tz.praemie)),
        quelle: f.text("quelle"),
        notiz: f.text("notiz"),
      } as never,
    });
    refresh();
    return { ok: t.allgemein.gespeichert };
  });
}

export async function zinssicherungLoeschen(kreditId: string, id: string): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { kontext, db, t } = await schreibKontext();
    await sichtbarerKredit(kontext, kreditId, t);
    await db.zinssicherung.deleteMany({ where: { id, kreditId } });
    refresh();
  });
}
