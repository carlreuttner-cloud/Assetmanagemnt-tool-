"use server";

import { refresh } from "next/cache";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { alsDbDatum, isoDatum, istIsoDatum, type IsoDatum } from "@/lib/datum";
import { erlaubt } from "@/lib/daten/portfolio";
import { ladeMieterBestand } from "@/lib/daten/import";
import { dezimal, zuText } from "@/lib/geld";
import { EingabeFehler, fuehreAus } from "@/lib/formular";
import { dekodiere } from "@/lib/import/csv";
import { buchungsSchluessel, leseKreditbuchungen } from "@/lib/import/kreditbuchungen";
import { leseMieterliste, planeMieterImport, type ListenFeld, type PlanAktion, type PlanZeile } from "@/lib/import/mieterliste";
import type { BuchungsArt } from "@/lib/kredit";

const MAX_MB = 2;

export interface MieterVorschau {
  hausId: string;
  hausName: string;
  stand: IsoDatum;
  dateiname: string;
  text: string;
  spalten: ListenFeld[];
  zeilen: PlanZeile[];
  fehlendeEinheiten: string[];
  anzahl: Record<PlanAktion, number>;
}

export type MieterVorschauErgebnis = { fehler?: string; vorschau?: MieterVorschau };

async function importKontext() {
  const kontext = await pruefeZugriff("import", "schreiben");
  return { kontext, db: kontext.db, t: texte(kontext.mandant.sprache) };
}

async function leseDatei(fd: FormData, name: string, t: ReturnType<typeof texte>) {
  const datei = fd.get(name);
  if (!(datei instanceof File) || datei.size === 0) throw new EingabeFehler(t.importe.keineDatei);
  if (datei.size > MAX_MB * 1024 * 1024) throw new EingabeFehler(fuelle(t.importe.dateiZuGross, { mb: MAX_MB }));
  return { dateiname: datei.name, text: dekodiere(new Uint8Array(await datei.arrayBuffer())) };
}

function leseStand(fd: FormData, t: ReturnType<typeof texte>): IsoDatum {
  const stand = String(fd.get("stand") ?? "").trim();
  if (!istIsoDatum(stand)) throw new EingabeFehler(fuelle(t.fehler.datum, { feld: t.importe.stand }));
  return stand;
}

/** Plant den Import einer Mieterliste für ein sichtbares Haus (wird beim Übernehmen neu berechnet). */
async function planeMieterliste(kontext: Awaited<ReturnType<typeof importKontext>>["kontext"], hausId: string, text: string, stand: IsoDatum) {
  const t = texte(kontext.mandant.sprache);
  const sicht = await sichtbarkeit(kontext);
  const haus = await kontext.db.haus.findFirst({ where: { id: erlaubt(sicht.hausIds, hausId) }, select: { id: true, bezeichnung: true } });
  if (!haus || haus.id !== hausId) throw new EingabeFehler(fuelle(t.fehler.pflichtfeld, { feld: t.importe.haus }));
  const liste = leseMieterliste(text);
  if (liste.fehler) throw new EingabeFehler(t.importe.keineTabelle);
  const bestand = await ladeMieterBestand(kontext.db, haus.id);
  const plan = planeMieterImport(bestand, liste, { stand, darfEinheitenPflegen: darf(kontext.rolle, "haeuser", "schreiben") });
  return { haus, liste, plan };
}

function zaehle(zeilen: PlanZeile[]): Record<PlanAktion, number> {
  const anzahl: Record<PlanAktion, number> = { neu: 0, aendern: 0, mieterwechsel: 0, auszug: 0, unveraendert: 0, fehler: 0 };
  for (const z of zeilen) anzahl[z.aktion]++;
  return anzahl;
}

export async function mieterlisteVorschau(_v: MieterVorschauErgebnis, fd: FormData): Promise<MieterVorschauErgebnis> {
  let vorschau: MieterVorschau | undefined;
  const ergebnis = await fuehreAus(async () => {
    const { kontext, t } = await importKontext();
    const hausId = String(fd.get("hausId") ?? "");
    const stand = leseStand(fd, t);
    const { dateiname, text } = await leseDatei(fd, "datei", t);
    const { haus, liste, plan } = await planeMieterliste(kontext, hausId, text, stand);
    vorschau = {
      hausId: haus.id,
      hausName: haus.bezeichnung,
      stand,
      dateiname,
      text,
      spalten: liste.spalten,
      zeilen: plan.zeilen,
      fehlendeEinheiten: plan.fehlendeEinheiten,
      anzahl: zaehle(plan.zeilen),
    };
  });
  return ergebnis.fehler ? { fehler: ergebnis.fehler } : { vorschau };
}

/** Übernimmt eine Mieterliste. Der Plan wird aus der Datei neu berechnet, nicht aus dem Browser übernommen. */
export async function mieterlisteUebernehmen(_v: { fehler?: string; ok?: string }, fd: FormData) {
  return fuehreAus(async () => {
    const { kontext, db, t } = await importKontext();
    const stand = leseStand(fd, t);
    const text = String(fd.get("text") ?? "");
    const dateiname = String(fd.get("dateiname") ?? "mieterliste.csv").slice(0, 200);
    if (!text) throw new EingabeFehler(t.importe.keineDatei);
    const { haus, plan } = await planeMieterliste(kontext, String(fd.get("hausId") ?? ""), text, stand);

    // Mehrfach genannte neue Mieter (z. B. Wohnung und Stellplatz) nur einmal anlegen
    const neueMieter = new Map<string, string>();
    const mieterId = async (name: string, vorhanden: string | null) => {
      if (vorhanden) return vorhanden;
      const key = name.toLowerCase();
      if (!neueMieter.has(key)) neueMieter.set(key, (await db.mieter.create({ data: { name } as never })).id);
      return neueMieter.get(key)!;
    };

    for (const z of plan.zeilen) {
      if (z.aktion === "fehler" || z.aktion === "unveraendert") continue;
      let einheitId = z.einheitId;
      if (!einheitId && z.neueEinheit) {
        const erwartet = z.einheitAenderungen.find((a) => a.feld === "erwarteteMiete")?.neu ?? null;
        einheitId = (
          await db.einheit.create({
            data: { hausId: haus.id, bezeichnung: z.einheit, art: z.neueEinheit.art, flaeche: z.neueEinheit.flaeche, erwarteteMiete: erwartet } as never,
          })
        ).id;
      } else if (einheitId && z.einheitAenderungen.length > 0) {
        const daten: Record<string, string | null> = {};
        for (const a of z.einheitAenderungen) daten[a.feld] = a.neu;
        await db.einheit.update({ where: { id: einheitId }, data: daten });
      }
      if (z.beenden) await db.mietverhaeltnis.update({ where: { id: z.beenden.id }, data: { ende: alsDbDatum(z.beenden.ende) } });
      if (z.aktualisieren) {
        const daten: Record<string, unknown> = {};
        for (const a of z.aktualisieren.aenderungen) {
          if (a.feld === "beginn" || a.feld === "ende" || a.feld === "letzteMieterhoehung") daten[a.feld] = a.neu ? alsDbDatum(a.neu) : null;
          else if (a.feld === "rueckstand") {
            daten.rueckstand = a.neu;
            daten.rueckstandStichtag = alsDbDatum(stand);
          } else daten[a.feld] = a.neu;
        }
        await db.mietverhaeltnis.update({ where: { id: z.aktualisieren.id }, data: daten });
      }
      if (z.anlegen && einheitId) {
        const n = z.anlegen;
        await db.mietverhaeltnis.create({
          data: {
            einheitId,
            mieterId: await mieterId(n.mieterName, n.mieterId),
            beginn: alsDbDatum(n.beginn),
            ende: n.ende ? alsDbDatum(n.ende) : null,
            sollMiete: n.sollMiete,
            istMiete: n.istMiete,
            rueckstand: n.rueckstand,
            rueckstandStichtag: dezimal(n.rueckstand).greaterThan(0) ? alsDbDatum(stand) : null,
            letzteMieterhoehung: n.letzteMieterhoehung ? alsDbDatum(n.letzteMieterhoehung) : null,
          } as never,
        });
      }
    }

    const anzahl = zaehle(plan.zeilen);
    await db.importvorgang.create({
      data: { art: "MIETERLISTE", dateiname, benutzerId: kontext.benutzer.id, hausId: haus.id, stand: alsDbDatum(stand), ergebnis: anzahl } as never,
    });
    refresh();
    return { ok: fuelle(t.importe.uebernommen, { zusammenfassung: zusammenfassung(anzahl, t) }) };
  });
}

function zusammenfassung(anzahl: Partial<Record<string, number>>, t: ReturnType<typeof texte>) {
  const namen: Record<string, string> = { ...t.importe.aktionen, dublette: t.importe.dublette };
  return Object.entries(anzahl)
    .filter(([, n]) => n && n > 0)
    .map(([k, n]) => `${n} ${namen[k] ?? k}`)
    .join(", ");
}

// ---------------------------------------------------------------------------
// Kreditbuchungen

export interface BuchungVorschau {
  zeile: number;
  datum: IsoDatum;
  art: BuchungsArt;
  betrag: string;
  saldoNach: string | null;
  text: string;
  neu: boolean;
}

export interface DateiVorschau {
  dateiname: string;
  text: string;
  aufbau: string;
  iban: string | null;
  kreditnummer: string | null;
  kreditId: string | null;
  erkanntUeber: "iban" | "kreditnummer" | "auswahl" | null;
  buchungen: BuchungVorschau[];
  unlesbar: number[];
  neu: number;
  doppelt: number;
  /** Datei ohne erkennbare Tabelle */
  ohneTabelle: boolean;
}

export type KreditVorschauErgebnis = { fehler?: string; dateien?: DateiVorschau[] };

type Eingang = { dateiname: string; text: string; kreditId: string | null };

async function kreditKontext() {
  const { kontext, db, t } = await importKontext();
  if (!darf(kontext.rolle, "gesellschaften", "schreiben")) throw new EingabeFehler(t.fehler.unbekannt);
  const sicht = await sichtbarkeit(kontext);
  const kredite = await db.kredit.findMany({
    where: { gesellschaftId: erlaubt(sicht.gesellschaftIds) },
    select: { id: true, iban: true, kreditnummer: true },
  });
  return { kontext, db, t, kredite };
}

const ibanKey = (iban: string | null) => (iban ? iban.replace(/\s/g, "").toUpperCase() : null);

/** Liest Dateien, ordnet Kredite zu und vergleicht mit vorhandenen Buchungen. */
async function pruefeDateien(eingaenge: Eingang[], db: Awaited<ReturnType<typeof kreditKontext>>["db"], kredite: Array<{ id: string; iban: string | null; kreditnummer: string | null }>) {
  const ergebnis: DateiVorschau[] = [];
  for (const e of eingaenge) {
    const gelesen = leseKreditbuchungen(e.text);
    let kreditId: string | null = null;
    let erkanntUeber: DateiVorschau["erkanntUeber"] = null;
    if (e.kreditId && kredite.some((k) => k.id === e.kreditId)) {
      kreditId = e.kreditId;
      erkanntUeber = "auswahl";
    } else {
      const perIban = gelesen.iban ? kredite.find((k) => ibanKey(k.iban) === gelesen.iban) : undefined;
      const perNummer = gelesen.kreditnummer
        ? kredite.find((k) => k.kreditnummer?.trim().toLowerCase() === gelesen.kreditnummer!.trim().toLowerCase())
        : undefined;
      kreditId = perIban?.id ?? perNummer?.id ?? null;
      erkanntUeber = perIban ? "iban" : perNummer ? "kreditnummer" : null;
    }

    // Dubletten als Mehrfachmenge: zwei gleiche Gebühren am selben Tag sind zwei Buchungen
    const vorhanden = new Map<string, number>();
    if (kreditId) {
      const alt = await db.kreditbuchung.findMany({ where: { kreditId }, select: { datum: true, art: true, betrag: true } });
      for (const b of alt) {
        const key = buchungsSchluessel({ datum: isoDatum(b.datum), art: b.art, betrag: dezimal(b.betrag) });
        vorhanden.set(key, (vorhanden.get(key) ?? 0) + 1);
      }
    }
    const buchungen = gelesen.buchungen.map((b): BuchungVorschau => {
      const key = buchungsSchluessel(b);
      const rest = vorhanden.get(key) ?? 0;
      if (rest > 0) vorhanden.set(key, rest - 1);
      return {
        zeile: b.zeile,
        datum: b.datum,
        art: b.art,
        betrag: b.betrag.toFixed(2),
        saldoNach: b.saldoNach ? b.saldoNach.toFixed(2) : null,
        text: b.text,
        neu: rest === 0,
      };
    });
    ergebnis.push({
      dateiname: e.dateiname,
      text: e.text,
      aufbau: gelesen.aufbau,
      iban: gelesen.iban,
      kreditnummer: gelesen.kreditnummer,
      kreditId,
      erkanntUeber,
      buchungen,
      unlesbar: gelesen.fehler.filter((f) => f.zeile > 0).map((f) => f.zeile),
      neu: buchungen.filter((b) => b.neu).length,
      doppelt: buchungen.filter((b) => !b.neu).length,
      ohneTabelle: gelesen.fehler.some((f) => f.grund === "kopfzeile"),
    });
  }
  return ergebnis;
}

function leseEingaenge(fd: FormData): Eingang[] {
  try {
    const liste = JSON.parse(String(fd.get("dateienJson") ?? "[]")) as unknown;
    if (!Array.isArray(liste)) return [];
    return liste
      .filter((x): x is Eingang => typeof x?.dateiname === "string" && typeof x?.text === "string")
      .map((x) => ({ dateiname: x.dateiname.slice(0, 200), text: x.text, kreditId: typeof x.kreditId === "string" ? x.kreditId : null }));
  } catch {
    return [];
  }
}

export async function kreditbuchungenVorschau(_v: KreditVorschauErgebnis, fd: FormData): Promise<KreditVorschauErgebnis> {
  let dateien: DateiVorschau[] | undefined;
  const ergebnis = await fuehreAus(async () => {
    const { db, t, kredite } = await kreditKontext();
    let eingaenge = leseEingaenge(fd);
    if (eingaenge.length === 0) {
      const hochgeladen = fd.getAll("dateien").filter((d): d is File => d instanceof File && d.size > 0);
      if (hochgeladen.length === 0) throw new EingabeFehler(t.importe.keineDatei);
      if (hochgeladen.some((d) => d.size > MAX_MB * 1024 * 1024)) throw new EingabeFehler(fuelle(t.importe.dateiZuGross, { mb: MAX_MB }));
      eingaenge = await Promise.all(
        hochgeladen.map(async (d) => ({ dateiname: d.name, text: dekodiere(new Uint8Array(await d.arrayBuffer())), kreditId: null })),
      );
    }
    dateien = await pruefeDateien(eingaenge, db, kredite);
  });
  return ergebnis.fehler ? { fehler: ergebnis.fehler } : { dateien };
}

export async function kreditbuchungenUebernehmen(_v: { fehler?: string; ok?: string }, fd: FormData) {
  return fuehreAus(async () => {
    const { kontext, db, t, kredite } = await kreditKontext();
    const eingaenge = leseEingaenge(fd);
    if (eingaenge.length === 0) throw new EingabeFehler(t.importe.keineDatei);
    const dateien = await pruefeDateien(eingaenge, db, kredite);
    const ohneKredit = dateien.find((d) => !d.kreditId && d.neu > 0);
    if (ohneKredit) throw new EingabeFehler(fuelle(t.importe.kreditFehlt, { datei: ohneKredit.dateiname }));

    let neu = 0;
    let doppelt = 0;
    for (const d of dateien) {
      const zeilen = d.buchungen.filter((b) => b.neu);
      doppelt += d.doppelt;
      if (zeilen.length === 0 || !d.kreditId) continue;
      await db.kreditbuchung.createMany({
        data: zeilen.map((b) => ({
          kreditId: d.kreditId,
          datum: alsDbDatum(b.datum),
          art: b.art,
          betrag: zuText(b.betrag),
          saldoNach: b.saldoNach,
          notiz: b.text ? b.text.slice(0, 500) : null,
        })) as never,
      });
      neu += zeilen.length;
      await db.importvorgang.create({
        data: {
          art: "KREDITBUCHUNGEN",
          dateiname: d.dateiname.slice(0, 200),
          benutzerId: kontext.benutzer.id,
          kreditId: d.kreditId,
          ergebnis: { neu: zeilen.length, dublette: d.doppelt },
        } as never,
      });
    }
    refresh();
    return { ok: fuelle(t.importe.uebernommen, { zusammenfassung: zusammenfassung({ neu, dublette: doppelt }, t) || t.importe.nichtsZuTun }) };
  });
}
