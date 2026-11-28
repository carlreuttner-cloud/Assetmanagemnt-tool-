import "server-only";
import { bereichsSicht } from "@/lib/auth/auswahl";
import type { Kontext } from "@/lib/auth/kontext";
import { idFilter } from "@/lib/auth/sichtbarkeit";
import { heute, isoDatum, type IsoDatum } from "@/lib/datum";
import { dezimal, type Decimal } from "@/lib/geld";
import { abrufStand, positionStand, type AbrufStand, type PositionStand } from "@/lib/kapitalabruf";

export interface AbrufZeile {
  id: string;
  bezeichnung: string;
  gesellschaftId: string;
  gesellschaft: string;
  abrufAm: IsoDatum;
  faelligAm: IsoDatum;
  notiz: string | null;
  erstelltVon: string | null;
  stand: AbrufStand;
  positionen: Array<{
    id: string;
    gesellschafterId: string;
    gesellschafter: string;
    anteilProzent: Decimal;
    betrag: Decimal;
    stand: PositionStand;
    eingaenge: Array<{ id: string; datum: IsoDatum | null; betrag: Decimal; quelle: string | null }>;
  }>;
}

/** Kapitalabrufe der sichtbaren Gesellschaften mit Stand je Position (neueste zuerst). */
export async function ladeKapitalabrufe(kontext: Kontext, filter: { id?: string } = {}): Promise<AbrufZeile[]> {
  const sicht = await bereichsSicht(kontext);
  const stichtag = heute();
  const abrufe = await kontext.db.kapitalabruf.findMany({
    where: { id: filter.id, gesellschaftId: idFilter(sicht.gesellschaftIds) },
    orderBy: [{ faelligAm: "desc" }, { erstelltAm: "desc" }],
    select: {
      id: true,
      bezeichnung: true,
      abrufAm: true,
      faelligAm: true,
      notiz: true,
      erstelltVon: true,
      gesellschaft: { select: { id: true, name: true } },
      positionen: {
        orderBy: { gesellschafter: { name: "asc" } },
        select: {
          id: true,
          anteilProzent: true,
          betrag: true,
          gesellschafter: { select: { id: true, name: true } },
          eingaenge: { orderBy: { datum: "asc" }, select: { id: true, datum: true, betrag: true, quelle: true } },
        },
      },
    },
  });
  return abrufe.map((a) => {
    const faelligAm = isoDatum(a.faelligAm);
    const positionen = a.positionen.map((p) => {
      const eingaenge = p.eingaenge.map((e) => ({ id: e.id, datum: isoDatum(e.datum), betrag: dezimal(e.betrag), quelle: e.quelle }));
      const betrag = dezimal(p.betrag);
      return { id: p.id, gesellschafterId: p.gesellschafter.id, gesellschafter: p.gesellschafter.name, anteilProzent: dezimal(p.anteilProzent), betrag, eingaenge, stand: positionStand(betrag, eingaenge, faelligAm, stichtag) };
    });
    return {
      id: a.id,
      bezeichnung: a.bezeichnung,
      gesellschaftId: a.gesellschaft.id,
      gesellschaft: a.gesellschaft.name,
      abrufAm: isoDatum(a.abrufAm),
      faelligAm,
      notiz: a.notiz,
      erstelltVon: a.erstelltVon,
      stand: abrufStand(positionen),
      positionen,
    };
  });
}
