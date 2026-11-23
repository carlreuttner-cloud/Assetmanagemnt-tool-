"use server";

import { notFound, redirect } from "next/navigation";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { alsDbDatum, isoDatum } from "@/lib/datum";
import { zuText } from "@/lib/geld";
import { EingabeFehler, formularLeser, fuehreAus, type AktionsErgebnis } from "@/lib/formular";
import { ueberschneiden } from "@/lib/mietverhaeltnis";
import type { MandantDb } from "@/lib/db/mandant";

async function schreibKontext() {
  const kontext = await pruefeZugriff("mieter", "schreiben");
  return { kontext, db: kontext.db, t: texte(kontext.mandant.sprache), sprache: kontext.mandant.sprache };
}

/** Prüft, dass die Einheit im Zeitraum nicht schon anderweitig vermietet ist. */
async function pruefeZeitraum(
  db: MandantDb,
  meldung: string,
  einheitId: string,
  zeitraum: { beginn: string; ende: string | null },
  ausser: string | null,
) {
  const andere = await db.mietverhaeltnis.findMany({
    where: { einheitId, id: ausser ? { not: ausser } : undefined },
    include: { mieter: { select: { name: true } } },
  });
  const konflikt = andere.find((m) => ueberschneiden(zeitraum, { beginn: isoDatum(m.beginn), ende: isoDatum(m.ende) }));
  if (konflikt) throw new EingabeFehler(fuelle(meldung, { mieter: konflikt.mieter.name }));
}

export async function mietverhaeltnisSpeichern(id: string | null, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  let ziel = id;
  const ergebnis = await fuehreAus(async () => {
    const { db, t, sprache } = await schreibKontext();
    const f = formularLeser(fd, sprache);
    const m = t.mieter;
    const einheitId = f.pflicht("einheitId", m.einheit);
    const beginn = f.datum("beginn", m.beginn);
    const ende = f.datumOptional("ende", m.ende);
    if (ende && ende < beginn) throw new EingabeFehler(m.endeVorBeginn);
    const soll = f.betrag("sollMiete", m.sollMiete);
    const ist = f.betragOptional("istMiete", m.istMiete) ?? soll;
    const erhoehung = f.datumOptional("letzteMieterhoehung", m.letzteMieterhoehung);
    const rueckstand = f.betragOptional("rueckstand", m.rueckstand);
    const rueckstandStichtag = f.datumOptional("rueckstandStichtag", m.rueckstandStichtag);

    await pruefeZeitraum(db, m.ueberschneidung, einheitId, { beginn, ende }, id);

    let mieterId = f.text("mieterId");
    const neuerName = f.text("mieterName");
    if (!mieterId && !neuerName) throw new EingabeFehler(m.mieterFehlt);
    if (!mieterId) {
      mieterId = (await db.mieter.create({ data: { name: neuerName!, istFirma: fd.get("istFirma") === "on" } as never })).id;
    }

    const daten = {
      einheitId,
      mieterId,
      beginn: alsDbDatum(beginn),
      ende: ende ? alsDbDatum(ende) : null,
      sollMiete: zuText(soll)!,
      istMiete: zuText(ist)!,
      letzteMieterhoehung: erhoehung ? alsDbDatum(erhoehung) : null,
      rueckstand: zuText(rueckstand ?? 0)!,
      rueckstandStichtag: rueckstandStichtag ? alsDbDatum(rueckstandStichtag) : null,
      notiz: f.text("notiz"),
    };
    if (id) await db.mietverhaeltnis.update({ where: { id }, data: daten });
    else ziel = (await db.mietverhaeltnis.create({ data: daten as never })).id;
  });
  if (ergebnis.fehler) return ergebnis;
  redirect(`/mieter/vertraege/${ziel}`);
}

export async function mieterhoehungErfassen(id: string, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const ergebnis = await fuehreAus(async () => {
    const { db, t, sprache } = await schreibKontext();
    const f = formularLeser(fd, sprache);
    const m = t.mieter;
    const datum = f.datum("datum", m.wirksamAb);
    const soll = f.betrag("sollMiete", m.neueSollMiete);
    const ist = f.betragOptional("istMiete", m.neueIstMiete) ?? soll;
    await db.mietverhaeltnis.update({
      where: { id },
      data: { sollMiete: zuText(soll)!, istMiete: zuText(ist)!, letzteMieterhoehung: alsDbDatum(datum) },
    });
  });
  if (ergebnis.fehler) return ergebnis;
  redirect(`/mieter/vertraege/${id}`);
}

export async function mietverhaeltnisBeenden(id: string, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  const ergebnis = await fuehreAus(async () => {
    const { db, t, sprache } = await schreibKontext();
    const f = formularLeser(fd, sprache);
    const ende = f.datum("ende", t.mieter.ende);
    const mv = await db.mietverhaeltnis.findUnique({ where: { id }, select: { beginn: true } });
    if (!mv) notFound();
    if (ende < isoDatum(mv.beginn)) throw new EingabeFehler(t.mieter.endeVorBeginn);
    await db.mietverhaeltnis.update({ where: { id }, data: { ende: alsDbDatum(ende) } });
  });
  if (ergebnis.fehler) return ergebnis;
  redirect(`/mieter/vertraege/${id}`);
}

export async function mietverhaeltnisLoeschen(id: string): Promise<AktionsErgebnis> {
  let mieterId = "";
  const ergebnis = await fuehreAus(async () => {
    const { db } = await schreibKontext();
    const mv = await db.mietverhaeltnis.delete({ where: { id } });
    mieterId = mv.mieterId;
  });
  if (ergebnis.fehler) return ergebnis;
  redirect(`/mieter/personen/${mieterId}`);
}

export async function mieterSpeichern(id: string, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { db, t, sprache } = await schreibKontext();
    const f = formularLeser(fd, sprache);
    await db.mieter.update({
      where: { id },
      data: {
        name: f.pflicht("name", t.mieter.name),
        istFirma: fd.get("istFirma") === "on",
        email: f.text("email"),
        telefon: f.text("telefon"),
        notiz: f.text("notiz"),
      },
    });
    return { ok: t.allgemein.gespeichert };
  });
}

export async function mieterLoeschen(id: string): Promise<AktionsErgebnis> {
  const ergebnis = await fuehreAus(async () => {
    const { db, t } = await schreibKontext();
    if ((await db.mietverhaeltnis.count({ where: { mieterId: id } })) > 0) throw new EingabeFehler(t.mieter.loeschenNichtMoeglich);
    await db.mieter.delete({ where: { id } });
  });
  if (ergebnis.fehler) return ergebnis;
  redirect("/mieter?status=alle");
}
