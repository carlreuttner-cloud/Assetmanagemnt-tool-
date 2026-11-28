import "server-only";
import { bereichsSicht } from "@/lib/auth/auswahl";
import type { Kontext } from "@/lib/auth/kontext";
import { idFilter } from "@/lib/auth/sichtbarkeit";
import { heute, isoDatum, type IsoDatum } from "@/lib/datum";
import { dezimal, type Decimal } from "@/lib/geld";
import { bauteilStatus, istUebernommen, naechsteErneuerung, type BauteilDaten, type BauteilStatus } from "@/lib/instandhaltung";

export interface InstandhaltungBauteil extends BauteilDaten {
  kostenQuelle: string | null;
  kostenStand: IsoDatum | null;
  notiz: string | null;
  naechste: number | null;
  status: BauteilStatus;
  positionen: Array<{ id: string; monat: IsoDatum; betrag: Decimal }>;
  uebernommen: boolean;
}

export interface InstandhaltungHaus {
  id: string;
  bezeichnung: string;
  gesellschaftId: string;
  gesellschaft: string;
  bauteile: InstandhaltungBauteil[];
}

/** Bauteile der sichtbaren Häuser (optional nur ein Haus oder eine Gesellschaft). */
export async function ladeInstandhaltung(kontext: Kontext, filter: { hausId?: string; gesellschaftId?: string } = {}): Promise<{ stichtag: IsoDatum; jahr: number; haeuser: InstandhaltungHaus[] }> {
  const sicht = await bereichsSicht(kontext);
  const stichtag = heute();
  const jahr = Number(stichtag.slice(0, 4));
  const erlaubt = (id: string) => sicht.hausIds === "alle" || sicht.hausIds.includes(id);
  const haeuser = await kontext.db.haus.findMany({
    where: {
      id: filter.hausId ? (erlaubt(filter.hausId) ? filter.hausId : { in: [] }) : idFilter(sicht.hausIds),
      ...(filter.gesellschaftId ? { gesellschaftId: filter.gesellschaftId } : {}),
    },
    orderBy: { bezeichnung: "asc" },
    select: {
      id: true,
      bezeichnung: true,
      gesellschaftId: true,
      gesellschaft: { select: { name: true } },
      bauteile: {
        orderBy: [{ art: "asc" }, { bezeichnung: "asc" }],
        include: { planpositionen: { select: { id: true, monat: true, betrag: true }, orderBy: { monat: "asc" } } },
      },
    },
  });
  return {
    stichtag,
    jahr,
    haeuser: haeuser.map((h) => ({
      id: h.id,
      bezeichnung: h.bezeichnung,
      gesellschaftId: h.gesellschaftId,
      gesellschaft: h.gesellschaft.name,
      bauteile: h.bauteile.map((b) => {
        const positionen = b.planpositionen.map((p) => ({ id: p.id, monat: isoDatum(p.monat)!, betrag: dezimal(p.betrag.toString()) }));
        return {
          id: b.id,
          art: b.art,
          bezeichnung: b.bezeichnung,
          zyklusJahre: b.zyklusJahre,
          letzteErneuerung: b.letzteErneuerung,
          geplanteKosten: b.geplanteKosten === null ? null : dezimal(b.geplanteKosten.toString()),
          kostenQuelle: b.kostenQuelle,
          kostenStand: isoDatum(b.kostenStand),
          notiz: b.notiz,
          naechste: naechsteErneuerung(b),
          status: bauteilStatus(b, jahr),
          positionen,
          uebernommen: istUebernommen(b, positionen),
        };
      }),
    })),
  };
}
