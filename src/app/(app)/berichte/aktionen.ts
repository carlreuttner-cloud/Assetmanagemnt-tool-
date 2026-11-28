"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { alsDbDatum, heute } from "@/lib/datum";
import { baueQuartalsbericht } from "@/lib/daten/quartalsbericht";
import { EingabeFehler, formularLeser, fuehreAus, type AktionsErgebnis } from "@/lib/formular";
import { darfFreigeben, quartalsende, type Quartal } from "@/lib/quartalsbericht";

async function schreibKontext() {
  const kontext = await pruefeZugriff("berichte", "schreiben");
  await sichtbarkeit(kontext);
  return { kontext, db: kontext.db, t: texte(kontext.mandant.sprache) };
}

async function entwurf(id: string) {
  const { kontext, db, t } = await schreibKontext();
  const bericht = await db.quartalsbericht.findFirst({ where: { id }, select: { id: true, status: true, erstelltVonId: true, gesellschaftId: true, jahr: true, quartal: true } });
  if (!bericht) throw new EingabeFehler(t.fehler.unbekannt);
  if (bericht.status !== "ENTWURF") throw new EingabeFehler(t.quartalsbericht.nurEntwurf);
  return { kontext, db, t, bericht };
}

/** Rechnet den Bericht zum Quartalsende, friert ihn als Entwurf ein und öffnet ihn. */
export async function berichtErstellen(_v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  let neu: string | null = null;
  const ergebnis = await fuehreAus(async () => {
    const { kontext, db, t } = await schreibKontext();
    const tq = t.quartalsbericht;
    const f = formularLeser(fd, kontext.mandant.sprache);
    const umfang = f.pflicht("umfang", tq.umfang);
    const [j, q] = f.pflicht("quartal", tq.quartal).split("-").map(Number);
    if (!Number.isInteger(j) || ![1, 2, 3, 4].includes(q) || quartalsende(j, q as Quartal) > heute()) throw new EingabeFehler(tq.quartalUngueltig);
    const gesellschaftId = umfang === "portfolio" ? null : umfang;
    const inhalt = await baueQuartalsbericht(kontext, gesellschaftId, j, q as Quartal, { portfolio: tq.portfolio });
    if (!inhalt) throw new EingabeFehler(t.fehler.unbekannt);
    const b = await db.quartalsbericht.create({
      data: {
        gesellschaftId,
        jahr: j,
        quartal: q,
        stichtag: alsDbDatum(inhalt.stichtag),
        inhalt: inhalt as never,
        erstelltVonId: kontext.benutzer.id,
        erstelltVonName: kontext.benutzer.name,
      } as never,
      select: { id: true },
    });
    neu = b.id;
  });
  if (neu) redirect(`/berichte/${neu}`);
  return ergebnis;
}

export async function kommentarSpeichern(id: string, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { kontext, db, t } = await entwurf(id);
    await db.quartalsbericht.update({ where: { id }, data: { kommentar: formularLeser(fd, kontext.mandant.sprache).text("kommentar") } });
    refresh();
    return { ok: t.allgemein.gespeichert };
  });
}

/** Vier-Augen-Freigabe: nur eine andere Person als der Ersteller, höchstens ein freigegebener Bericht je Quartal und Umfang. */
export async function berichtFreigeben(id: string): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { kontext, db, t, bericht } = await entwurf(id);
    if (darfFreigeben(bericht, kontext.benutzer.id) === "selbst") throw new EingabeFehler(t.quartalsbericht.selbstFreigabe);
    const doppelt = await db.quartalsbericht.count({ where: { status: "FREIGEGEBEN", gesellschaftId: bericht.gesellschaftId, jahr: bericht.jahr, quartal: bericht.quartal } });
    if (doppelt > 0) throw new EingabeFehler(t.quartalsbericht.bereitsFreigegeben);
    const { count } = await db.quartalsbericht.updateMany({
      where: { id, status: "ENTWURF", erstelltVonId: { not: kontext.benutzer.id } },
      data: { status: "FREIGEGEBEN", freigegebenVonId: kontext.benutzer.id, freigegebenVonName: kontext.benutzer.name, freigegebenAm: new Date() },
    });
    if (count === 0) throw new EingabeFehler(t.quartalsbericht.nurEntwurf);
    refresh();
    return { ok: t.allgemein.gespeichert };
  });
}

export async function berichtVerwerfen(id: string, _v: AktionsErgebnis, fd: FormData): Promise<AktionsErgebnis> {
  return fuehreAus(async () => {
    const { kontext, db, t } = await entwurf(id);
    const grund = formularLeser(fd, kontext.mandant.sprache).text("grund");
    if (!grund) throw new EingabeFehler(t.quartalsbericht.verwerfenGrundPflicht);
    await db.quartalsbericht.updateMany({ where: { id, status: "ENTWURF" }, data: { status: "VERWORFEN", verworfenGrund: grund } });
    refresh();
    return { ok: t.allgemein.gespeichert };
  });
}
