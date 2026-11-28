"use server";

import { refresh } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { alsDbDatum } from "@/lib/datum";
import { erlaubt } from "@/lib/daten/portfolio";
import { BILD_TYPEN, bildTypAusInhalt, entferne, MAX_BILD_MB, speichere } from "@/lib/dateispeicher";
import { zuText } from "@/lib/geld";
import { EingabeFehler, formularLeser, fuehreAus, type AktionsErgebnis } from "@/lib/formular";
import { NUTZUNGSARTEN } from "@/lib/nutzungsart";

const EINHEIT_ARTEN = NUTZUNGSARTEN;
const VERFAHREN = ["ERTRAGSWERT", "SACHWERT", "VERGLEICHSWERT", "SONSTIGES"] as const;

async function schreibKontext() {
  const kontext = await pruefeZugriff("haeuser", "schreiben");
  return { kontext, db: kontext.db, t: texte(kontext.mandant.sprache), sprache: kontext.mandant.sprache };
}

// ---------------------------------------------------------------------------
// Häuser
// ---------------------------------------------------------------------------

export async function hausSpeichern(id: string | null, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  let ziel = id;
  const ergebnis = await fuehreAus(async () => {
    const { db, t, sprache } = await schreibKontext();
    const f = formularLeser(fd, sprache);
    const h = t.haeuser;
    const kaufdatum = f.datumOptional("kaufdatum", h.kaufdatum);
    const daten = {
      gesellschaftId: f.pflicht("gesellschaftId", h.gesellschaft),
      bezeichnung: f.pflicht("bezeichnung", h.bezeichnung),
      strasse: f.text("strasse"),
      plz: f.text("plz"),
      ort: f.text("ort"),
      kaufpreis: zuText(f.betragOptional("kaufpreis", h.kaufpreis)),
      kaufdatum: kaufdatum ? alsDbDatum(kaufdatum) : null,
      notiz: f.text("notiz"),
    };
    if (id) await db.haus.update({ where: { id }, data: daten });
    else ziel = (await db.haus.create({ data: daten as never })).id;
  });
  if (ergebnis.fehler) return ergebnis;
  redirect(`/haeuser/${ziel}`);
}

export async function hausLoeschen(id: string): Promise<AktionsErgebnis> {
  const ergebnis = await fuehreAus(async () => {
    const { db, t } = await schreibKontext();
    const [einheiten, kredite] = await Promise.all([db.einheit.count({ where: { hausId: id } }), db.kreditHaus.count({ where: { hausId: id } })]);
    if (einheiten + kredite > 0) throw new EingabeFehler(t.haeuser.loeschenNichtMoeglich);
    const fotos = await db.foto.findMany({ where: { hausId: id }, select: { speicherPfad: true } });
    await db.gutachten.deleteMany({ where: { hausId: id } });
    await db.verkehrswert.deleteMany({ where: { hausId: id } });
    await db.investition.deleteMany({ where: { hausId: id } });
    await db.foto.deleteMany({ where: { hausId: id } });
    await db.haus.delete({ where: { id } });
    for (const foto of fotos) await entferne(foto.speicherPfad);
  });
  if (ergebnis.fehler) return ergebnis;
  redirect("/haeuser");
}

// ---------------------------------------------------------------------------
// Einheiten
// ---------------------------------------------------------------------------

export async function einheitSpeichern(
  ort: { id: string | null; hausId: string },
  _v: AktionsErgebnis,
  fd: FormData,
): Promise<AktionsErgebnis> {
  const ergebnis = await fuehreAus(async () => {
    const { db, t, sprache } = await schreibKontext();
    const f = formularLeser(fd, sprache);
    const e = t.einheiten;
    const daten = {
      bezeichnung: f.pflicht("bezeichnung", e.bezeichnung),
      art: f.auswahl("art", e.art, EINHEIT_ARTEN),
      flaeche: zuText(f.betrag("flaeche", e.flaeche))!,
      lage: f.text("lage"),
      erwarteteMiete: zuText(f.betragOptional("erwarteteMiete", e.erwarteteMiete)),
      notiz: f.text("notiz"),
    };
    if (ort.id) await db.einheit.update({ where: { id: ort.id }, data: daten });
    else await db.einheit.create({ data: { ...daten, hausId: ort.hausId } as never });
  });
  if (ergebnis.fehler) return ergebnis;
  redirect(`/haeuser/${ort.hausId}#einheiten`);
}

export async function einheitLoeschen(id: string, hausId: string): Promise<AktionsErgebnis> {
  const ergebnis = await fuehreAus(async () => {
    const { db, t } = await schreibKontext();
    if ((await db.mietverhaeltnis.count({ where: { einheitId: id } })) > 0) throw new EingabeFehler(t.einheiten.loeschenNichtMoeglich);
    await db.investition.updateMany({ where: { einheitId: id }, data: { einheitId: null } });
    await db.einheit.delete({ where: { id } });
  });
  if (ergebnis.fehler) return ergebnis;
  redirect(`/haeuser/${hausId}#einheiten`);
}

// ---------------------------------------------------------------------------
// Verkehrswerte, Investitionen, Fotos
// ---------------------------------------------------------------------------

export async function verkehrswertHinzufuegen(hausId: string, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { db, t, sprache } = await schreibKontext();
    const f = formularLeser(fd, sprache);
    await db.verkehrswert.create({
      data: {
        hausId,
        stichtag: alsDbDatum(f.datum("stichtag", t.allgemein.stichtag)),
        wert: zuText(f.betrag("wert", t.haeuser.wert)),
        quelle: f.text("quelle"),
        notiz: f.text("notiz"),
      } as never,
    });
    refresh();
    return { ok: t.allgemein.gespeichert };
  });
}

export async function verkehrswertLoeschen(id: string): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { db } = await schreibKontext();
    await db.verkehrswert.delete({ where: { id } });
    refresh();
  });
}

export async function investitionHinzufuegen(hausId: string, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { db, t, sprache } = await schreibKontext();
    const f = formularLeser(fd, sprache);
    const h = t.haeuser;
    await db.investition.create({
      data: {
        hausId,
        einheitId: f.text("einheitId"),
        datum: alsDbDatum(f.datum("datum", t.allgemein.datum)),
        betrag: zuText(f.betrag("betrag", t.allgemein.betrag)),
        kategorie: f.text("kategorie"),
        beschreibung: f.pflicht("beschreibung", h.beschreibung),
      } as never,
    });
    refresh();
    return { ok: t.allgemein.gespeichert };
  });
}

export async function investitionLoeschen(id: string): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { db } = await schreibKontext();
    await db.investition.delete({ where: { id } });
    refresh();
  });
}

export async function fotoHochladen(hausId: string, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { db, t, kontext } = await schreibKontext();
    const h = t.haeuser;
    const datei = fd.get("datei");
    if (!(datei instanceof File) || datei.size === 0) throw new EingabeFehler(h.fotoFehlt);
    if (datei.size > MAX_BILD_MB * 1024 * 1024) throw new EingabeFehler(fuelle(h.fotoGroesse, { mb: MAX_BILD_MB }));
    const inhalt = new Uint8Array(await datei.arrayBuffer());
    const typ = bildTypAusInhalt(inhalt);
    if (!typ || !BILD_TYPEN[typ]) throw new EingabeFehler(h.fotoTyp);
    if (!(await db.haus.findUnique({ where: { id: hausId }, select: { id: true } }))) notFound();

    const pfad = await speichere(kontext.mandant.id, "fotos", BILD_TYPEN[typ], inhalt);
    const anzahl = await db.foto.count({ where: { hausId } });
    await db.foto.create({
      data: {
        hausId,
        speicherPfad: pfad,
        dateiname: datei.name.slice(0, 200),
        mimeType: typ,
        groesseBytes: datei.size,
        beschreibung: typeof fd.get("beschreibung") === "string" ? String(fd.get("beschreibung")).trim() || null : null,
        reihenfolge: anzahl,
      } as never,
    });
    refresh();
    return { ok: t.allgemein.gespeichert };
  });
}

export async function fotoLoeschen(id: string): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { db } = await schreibKontext();
    const foto = await db.foto.delete({ where: { id } });
    await entferne(foto.speicherPfad);
    refresh();
  });
}

// ---------------------------------------------------------------------------
// Gutachten (mit verknüpftem Verkehrswert)
// ---------------------------------------------------------------------------

async function pruefeHaus(kontext: Awaited<ReturnType<typeof schreibKontext>>["kontext"], hausId: string) {
  const sicht = await sichtbarkeit(kontext);
  const haus = await kontext.db.haus.findFirst({ where: { id: erlaubt(sicht.hausIds, hausId) }, select: { id: true } });
  if (!haus) notFound();
}

function ganzeZahl(wert: string | null, feld: string, meldung: string): number | null {
  if (!wert) return null;
  if (!/^\d{1,4}$/.test(wert)) throw new EingabeFehler(fuelle(meldung, { feld }));
  return Number(wert);
}

export async function gutachtenSpeichern(ort: { id: string | null; hausId: string }, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const ergebnis = await fuehreAus(async () => {
    const { kontext, db, t, sprache } = await schreibKontext();
    await pruefeHaus(kontext, ort.hausId);
    const f = formularLeser(fd, sprache);
    const g = t.gutachten;
    const stichtag = alsDbDatum(f.datum("stichtag", g.stichtag));
    const erstelltAm = f.datumOptional("erstelltAm", g.erstelltAm);
    const verfahren = f.text("verfahren");
    if (verfahren && !VERFAHREN.includes(verfahren as (typeof VERFAHREN)[number])) throw new EingabeFehler(fuelle(t.fehler.pflichtfeld, { feld: g.verfahren }));
    const verkehrswert = f.betrag("verkehrswert", g.verkehrswert);
    const zahl = (name: string, feld: string) => ganzeZahl(f.text(name), feld, t.fehler.zahl);
    const daten = {
      stichtag,
      erstelltAm: erstelltAm ? alsDbDatum(erstelltAm) : null,
      gutachter: f.text("gutachter"),
      anlass: f.text("anlass"),
      verfahren: (verfahren as (typeof VERFAHREN)[number] | null) ?? null,
      verkehrswert: zuText(verkehrswert)!,
      rohertragJahr: zuText(f.betragOptional("rohertragJahr", g.rohertragJahr)),
      bewirtschaftungskosten: zuText(f.betragOptional("bewirtschaftungskosten", g.bewirtschaftungskosten)),
      reinertragJahr: zuText(f.betragOptional("reinertragJahr", g.reinertragJahr)),
      liegenschaftszins: zuText(f.prozentOptional("liegenschaftszins", g.liegenschaftszins)),
      restnutzungsdauer: zahl("restnutzungsdauer", g.restnutzungsdauer),
      gesamtnutzungsdauer: zahl("gesamtnutzungsdauer", g.gesamtnutzungsdauer),
      barwertfaktor: zuText(f.zahlOptional("barwertfaktor", g.barwertfaktor)),
      bodenwert: zuText(f.betragOptional("bodenwert", g.bodenwert)),
      gebaeudewert: zuText(f.betragOptional("gebaeudewert", g.gebaeudewert)),
      ertragswert: zuText(f.betragOptional("ertragswert", g.ertragswert)),
      sachwert: zuText(f.betragOptional("sachwert", g.sachwert)),
      vergleichswert: zuText(f.betragOptional("vergleichswert", g.vergleichswert)),
      zuAbschlaege: zuText(f.betragOptional("zuAbschlaege", g.zuAbschlaege)),
      baujahr: zahl("baujahr", g.baujahr),
      wohnflaeche: zuText(f.zahlOptional("wohnflaeche", g.wohnflaeche)),
      gewerbeflaeche: zuText(f.zahlOptional("gewerbeflaeche", g.gewerbeflaeche)),
      grundstuecksflaeche: zuText(f.zahlOptional("grundstuecksflaeche", g.grundstuecksflaeche)),
      einheiten: zahl("einheiten", g.einheiten),
      zustand: f.text("zustand"),
      energieklasse: f.text("energieklasse"),
      lage: f.text("lage"),
      staerken: f.text("staerken"),
      schwaechen: f.text("schwaechen"),
      chancen: f.text("chancen"),
      risiken: f.text("risiken"),
      notiz: f.text("notiz"),
    };
    // Der Verkehrswert des Gutachtens erscheint auch in der Verkehrswertliste des Hauses.
    const wertDaten = { stichtag, wert: daten.verkehrswert, quelle: g.quelleVerkehrswert };
    if (ort.id) {
      const bisher = await db.gutachten.findFirst({ where: { id: ort.id, hausId: ort.hausId }, select: { verkehrswertId: true } });
      if (!bisher) notFound();
      let verkehrswertId = bisher.verkehrswertId;
      if (verkehrswertId) await db.verkehrswert.update({ where: { id: verkehrswertId }, data: wertDaten });
      else verkehrswertId = (await db.verkehrswert.create({ data: { ...wertDaten, hausId: ort.hausId } as never })).id;
      await db.gutachten.update({ where: { id: ort.id }, data: { ...daten, verkehrswertId } as never });
    } else {
      const wert = await db.verkehrswert.create({ data: { ...wertDaten, hausId: ort.hausId } as never });
      await db.gutachten.create({ data: { ...daten, hausId: ort.hausId, verkehrswertId: wert.id } as never });
    }
  });
  if (ergebnis.fehler) return ergebnis;
  redirect(`/haeuser/${ort.hausId}/gutachten`);
}

export async function gutachtenLoeschen(id: string, hausId: string): Promise<AktionsErgebnis> {
  const ergebnis = await fuehreAus(async () => {
    const { kontext, db } = await schreibKontext();
    await pruefeHaus(kontext, hausId);
    const g = await db.gutachten.findFirst({ where: { id, hausId }, select: { verkehrswertId: true } });
    if (!g) notFound();
    await db.gutachten.delete({ where: { id } });
    if (g.verkehrswertId) await db.verkehrswert.delete({ where: { id: g.verkehrswertId } });
  });
  if (ergebnis.fehler) return ergebnis;
  redirect(`/haeuser/${hausId}/gutachten`);
}
