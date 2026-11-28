"use server";

import { refresh } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { alsDbDatum, heute } from "@/lib/datum";
import { erlaubt } from "@/lib/daten/portfolio";
import { dezimal, zuText } from "@/lib/geld";
import { EingabeFehler, formularLeser, fuehreAus, type AktionsErgebnis } from "@/lib/formular";
import { aufteilen } from "@/lib/kapitalabruf";

async function schreibKontext() {
  const kontext = await pruefeZugriff("gesellschaften", "schreiben");
  const sicht = await sichtbarkeit(kontext);
  return { kontext, sicht, db: kontext.db, t: texte(kontext.mandant.sprache) };
}

/** Legt einen Abruf an und verteilt ihn nach der Beteiligung der Gesellschafter. */
export async function kapitalabrufAnlegen(_v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  let ziel: string | null = null;
  const ergebnis = await fuehreAus(async () => {
    const { kontext, sicht, db, t } = await schreibKontext();
    const tk = t.kapitalabrufe;
    const f = formularLeser(fd, kontext.mandant.sprache);
    const g = await db.gesellschaft.findFirst({
      where: { id: erlaubt(sicht.gesellschaftIds, f.pflicht("gesellschaftId", tk.gesellschaft)) },
      select: { id: true, gesellschafter: { orderBy: { name: "asc" }, select: { id: true, name: true, beteiligungProzent: true } } },
    });
    if (!g) throw new EingabeFehler(tk.gesellschaftFehlt);
    const gesamt = f.betrag("gesamtbetrag", tk.gesamtbetrag);
    if (!gesamt.greaterThan(0)) throw new EingabeFehler(fuelle(t.fehler.betrag, { feld: tk.gesamtbetrag }));
    const abrufAm = f.datum("abrufAm", tk.abrufAm);
    const faelligAm = f.datum("faelligAm", tk.faelligAm);
    if (faelligAm < abrufAm) throw new EingabeFehler(tk.faelligVorAbruf);
    const a = aufteilen(
      gesamt,
      g.gesellschafter.map((x) => ({ id: x.id, name: x.name, beteiligungProzent: x.beteiligungProzent === null ? null : dezimal(x.beteiligungProzent) })),
    );
    if (!a.ok) throw new EingabeFehler(fuelle(tk.fehler[a.fehler], { namen: a.namen?.join(", ") ?? "", summe: a.summe?.toFixed() ?? "" }));
    const abruf = await db.kapitalabruf.create({
      data: {
        gesellschaftId: g.id,
        bezeichnung: f.pflicht("bezeichnung", tk.bezeichnung),
        abrufAm: alsDbDatum(abrufAm),
        faelligAm: alsDbDatum(faelligAm),
        gesamtbetrag: zuText(gesamt),
        notiz: f.text("notiz"),
        erstelltVon: kontext.benutzer.name,
      } as never,
      select: { id: true },
    });
    for (const p of a.positionen) {
      await db.kapitalabrufPosition.create({ data: { abrufId: abruf.id, gesellschafterId: p.gesellschafterId, anteilProzent: zuText(p.anteilProzent), betrag: zuText(p.betrag) } as never });
    }
    ziel = abruf.id;
  });
  if (ergebnis.fehler) return ergebnis;
  redirect(`/kapitalabrufe/${ziel}`);
}

async function sichtbarePosition(positionId: string) {
  const k = await schreibKontext();
  const p = await k.db.kapitalabrufPosition.findFirst({
    where: { id: positionId, abruf: { gesellschaftId: erlaubt(k.sicht.gesellschaftIds) } },
    select: { id: true, gesellschafterId: true, abruf: { select: { bezeichnung: true } } },
  });
  if (!p) notFound();
  return { ...k, p };
}

/** Zahlungseingang: legt eine Einlage im Kapitalkonto des Gesellschafters an. */
export async function eingangErfassen(positionId: string, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { kontext, db, t, p } = await sichtbarePosition(positionId);
    const tk = t.kapitalabrufe;
    const f = formularLeser(fd, kontext.mandant.sprache);
    const betrag = f.betrag("betrag", tk.eingangBetrag);
    if (!betrag.greaterThan(0)) throw new EingabeFehler(fuelle(t.fehler.betrag, { feld: tk.eingangBetrag }));
    const datum = f.datum("datum", tk.eingangDatum);
    if (datum > heute()) throw new EingabeFehler(tk.eingangZukunft);
    await db.kapitalbewegung.create({
      data: {
        gesellschafterId: p.gesellschafterId,
        abrufPositionId: p.id,
        art: "EINLAGE",
        datum: alsDbDatum(datum),
        betrag: zuText(betrag),
        quelle: f.text("quelle") ?? fuelle(tk.quelleVorgabe, { bezeichnung: p.abruf.bezeichnung }),
      } as never,
    });
    refresh();
    return { ok: t.allgemein.gespeichert };
  });
}

export async function eingangLoeschen(bewegungId: string): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { db, sicht } = await schreibKontext();
    const b = await db.kapitalbewegung.findFirst({ where: { id: bewegungId, abrufPositionId: { not: null }, gesellschafter: { gesellschaftId: erlaubt(sicht.gesellschaftIds) } }, select: { id: true } });
    if (!b) notFound();
    await db.kapitalbewegung.delete({ where: { id: b.id } });
    refresh();
  });
}

/** Löscht einen Abruf ohne Eingänge. */
export async function kapitalabrufLoeschen(id: string): Promise<AktionsErgebnis> {
  const ergebnis = await fuehreAus(async () => {
    const { db, sicht, t } = await schreibKontext();
    const a = await db.kapitalabruf.findFirst({ where: { id, gesellschaftId: erlaubt(sicht.gesellschaftIds) }, select: { id: true, positionen: { select: { _count: { select: { eingaenge: true } } } } } });
    if (!a) notFound();
    if (a.positionen.some((p) => p._count.eingaenge > 0)) throw new EingabeFehler(t.kapitalabrufe.loeschenMitEingang);
    await db.kapitalabruf.delete({ where: { id } });
  });
  if (ergebnis.fehler) return ergebnis;
  redirect("/kapitalabrufe");
}
