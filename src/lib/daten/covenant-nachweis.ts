import "server-only";
import type { Kontext } from "@/lib/auth/kontext";
import { erstelleNachweis, type NachweisInhalt } from "@/lib/covenant-nachweis";
import { isoDatum, type IsoDatum } from "@/lib/datum";
import { dezimal } from "@/lib/geld";
import { ladeRechengrundlage } from "./portfolio";

/** Baut den Nachweis eines sichtbaren Kredits zum Stichtag; null, wenn der Kredit nicht sichtbar ist. */
export async function baueCovenantNachweis(kontext: Kontext, kreditId: string, stichtag: IsoDatum): Promise<NachweisInhalt | null> {
  const grundlage = await ladeRechengrundlage(kontext);
  const daten = grundlage.kredite.find((k) => k.id === kreditId);
  if (!daten) return null;
  const [kredit, haeuser, kredite, verkehrswerte] = await Promise.all([
    kontext.db.kredit.findFirst({
      where: { id: kreditId },
      select: { bank: true, kreditnummer: true, gesellschaft: { select: { name: true } }, covenants: { orderBy: [{ folge: "asc" }, { kennzahl: "asc" }] } },
    }),
    kontext.db.haus.findMany({ where: { id: { in: grundlage.haeuser.map((h) => h.id) } }, select: { id: true, bezeichnung: true } }),
    kontext.db.kredit.findMany({ where: { id: { in: grundlage.kredite.map((k) => k.id) } }, select: { id: true, bezeichnung: true } }),
    kontext.db.verkehrswert.findMany({ where: { hausId: { in: daten.haeuser.map((h) => h.hausId) } }, select: { hausId: true, stichtag: true, quelle: true } }),
  ]);
  if (!kredit) return null;
  return erstelleNachweis({
    stichtag,
    erstelltAm: new Date(),
    erstelltVon: kontext.benutzer.name,
    mandant: kontext.mandant.name,
    kredit: { ...daten, bank: kredit.bank, kreditnummer: kredit.kreditnummer, gesellschaft: kredit.gesellschaft.name },
    haeuser: grundlage.haeuser,
    alleKredite: grundlage.kredite,
    referenzwerte: grundlage.referenzwerte,
    covenants: kredit.covenants.map((c) => ({
      kennzahl: c.kennzahl,
      folge: c.folge,
      vergleich: c.vergleich,
      schwellenwert: c.schwellenwert === null ? null : dezimal(c.schwellenwert),
      beschreibung: c.beschreibung,
    })),
    namen: { haus: new Map(haeuser.map((h) => [h.id, h.bezeichnung])), kredit: new Map(kredite.map((k) => [k.id, k.bezeichnung])) },
    verkehrswertQuelle: (hausId, tag) => verkehrswerte.find((v) => v.hausId === hausId && isoDatum(v.stichtag) === tag)?.quelle ?? null,
  });
}
