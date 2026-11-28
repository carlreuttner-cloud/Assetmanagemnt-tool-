"use server";

import { refresh } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { alsDbDatum } from "@/lib/datum";
import { erlaubt } from "@/lib/daten/portfolio";
import { GUV_POSTEN } from "@/lib/finanzen";
import { zuText } from "@/lib/geld";
import {
  EingabeFehler,
  formularLeser,
  fuehreAus,
  type AktionsErgebnis,
} from "@/lib/formular";
import { PLAN_ZEILEN, type PlanZeile } from "@/lib/plan-ist";

const VORLAGEN = ["leer", "vorjahrIst", "vorjahrPlan"] as const;
const STATUS = ["ENTWURF", "BESCHLOSSEN"] as const;

async function schreibKontext() {
  const kontext = await pruefeZugriff("gesellschaften", "schreiben");
  const sicht = await sichtbarkeit(kontext);
  return { kontext, sicht, db: kontext.db, t: texte(kontext.mandant.sprache) };
}

async function sichtbaresPlanjahr(id: string) {
  const k = await schreibKontext();
  const p = await k.db.planjahr.findFirst({
    where: { id, gesellschaftId: erlaubt(k.sicht.gesellschaftIds) },
    select: { id: true },
  });
  if (!p) notFound();
  return k;
}

/** Legt einen Plan an, leer oder mit den Werten aus Ist oder Plan des Vorjahres als Ausgangspunkt. */
export async function planAnlegen(
  _v: AktionsErgebnis,
  fd: FormData,
): Promise<AktionsErgebnis> {
  let ziel: string | null = null;
  const ergebnis = await fuehreAus(async () => {
    const { kontext, sicht, db, t } = await schreibKontext();
    const tp = t.planIst;
    const f = formularLeser(fd, kontext.mandant.sprache);
    const g = await db.gesellschaft.findFirst({
      where: {
        id: erlaubt(
          sicht.gesellschaftIds,
          f.pflicht("gesellschaftId", tp.gesellschaft),
        ),
      },
      select: { id: true },
    });
    if (!g) throw new EingabeFehler(tp.gesellschaftFehlt);
    const jahrText = f.pflicht("jahr", tp.jahr);
    if (!/^\d{4}$/.test(jahrText))
      throw new EingabeFehler(fuelle(t.fehler.zahl, { feld: tp.jahr }));
    const jahr = Number(jahrText);
    if (
      await db.planjahr.findFirst({
        where: { gesellschaftId: g.id, jahr },
        select: { id: true },
      })
    )
      throw new EingabeFehler(tp.jahrVorhanden);
    const vorlage = f.auswahl("vorlage", tp.vorlage, VORLAGEN);
    const quelle =
      vorlage === "vorjahrIst"
        ? await db.geschaeftsjahr.findFirst({
            where: { gesellschaftId: g.id, jahr: jahr - 1 },
          })
        : vorlage === "vorjahrPlan"
          ? await db.planjahr.findFirst({
              where: { gesellschaftId: g.id, jahr: jahr - 1 },
            })
          : null;
    if (vorlage !== "leer" && !quelle)
      throw new EingabeFehler(tp.vorlageFehlt[vorlage]);
    const werte = Object.fromEntries(
      GUV_POSTEN.map((p) => [p, quelle?.[p] ?? null]),
    );
    const p = await db.planjahr.create({
      data: {
        gesellschaftId: g.id,
        jahr,
        status: "ENTWURF",
        erstelltVon: kontext.benutzer.name,
        notiz:
          vorlage === "leer"
            ? null
            : fuelle(tp.vorlageNotiz[vorlage], { jahr: jahr - 1 }),
        ...werte,
      } as never,
      select: { id: true },
    });
    ziel = p.id;
  });
  if (ergebnis.fehler) return ergebnis;
  redirect(`/plan-ist/${ziel}`);
}

export async function planSpeichern(
  id: string,
  _v: AktionsErgebnis,
  fd: FormData,
): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { kontext, db, t } = await sichtbaresPlanjahr(id);
    const tp = t.planIst;
    const f = formularLeser(fd, kontext.mandant.sprache);
    const status = f.auswahl("status", tp.status, STATUS);
    const beschlossenAm = f.datumOptional("beschlossenAm", tp.beschlossenAm);
    if (status === "BESCHLOSSEN" && !beschlossenAm)
      throw new EingabeFehler(tp.beschlossenOhneDatum);
    const daten: Record<string, unknown> = {
      status,
      beschlossenAm: beschlossenAm ? alsDbDatum(beschlossenAm) : null,
      quelle: f.text("quelle"),
      notiz: f.text("notiz"),
    };
    for (const p of GUV_POSTEN)
      daten[p] = zuText(f.betragOptional(p, t.finanzen.posten[p]));
    await db.planjahr.update({ where: { id }, data: daten as never });
    refresh();
    return { ok: t.allgemein.gespeichert };
  });
}

export async function planLoeschen(id: string): Promise<AktionsErgebnis> {
  const ergebnis = await fuehreAus(async () => {
    const { db } = await sichtbaresPlanjahr(id);
    await db.planjahr.delete({ where: { id } });
  });
  if (ergebnis.fehler) return ergebnis;
  redirect("/plan-ist");
}

/** Erklärung einer Abweichung speichern; leerer Text löscht sie. */
export async function erklaerungSpeichern(
  planjahrId: string,
  zeile: PlanZeile,
  _v: AktionsErgebnis,
  fd: FormData,
): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { kontext, db, t } = await sichtbaresPlanjahr(planjahrId);
    if (!PLAN_ZEILEN.includes(zeile)) notFound();
    const text = formularLeser(fd, kontext.mandant.sprache).text("text");
    if (text) {
      await db.planerklaerung.upsert({
        where: { planjahrId_zeile: { planjahrId, zeile } },
        create: {
          planjahrId,
          zeile,
          text,
          erstelltVon: kontext.benutzer.name,
        } as never,
        update: { text, erstelltVon: kontext.benutzer.name },
      });
    } else {
      await db.planerklaerung.deleteMany({ where: { planjahrId, zeile } });
    }
    refresh();
    return { ok: t.allgemein.gespeichert };
  });
}
