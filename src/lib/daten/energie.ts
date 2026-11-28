import "server-only";
import { bereichsSicht } from "@/lib/auth/auswahl";
import type { Kontext } from "@/lib/auth/kontext";
import { idFilter } from "@/lib/auth/sichtbarkeit";
import { heute, isoDatum, type IsoDatum } from "@/lib/datum";
import { ausweisStatus, massgeblicherAusweis, type AusweisDaten, type AusweisStatus, type Flaeche, type VerbrauchDaten } from "@/lib/energie";
import { dezimal } from "@/lib/geld";

export interface EnergieHaus {
  id: string;
  bezeichnung: string;
  gesellschaft: string;
  flaeche: Flaeche;
  ausweise: Array<AusweisDaten & { registriernummer: string | null; notiz: string | null; erstelltVon: string | null }>;
  massgeblich: (AusweisDaten & { registriernummer: string | null }) | null;
  status: AusweisStatus;
  verbraeuche: Array<VerbrauchDaten & { id: string; energietraeger: string | null; notiz: string | null }>;
}

const d = (w: { toString(): string } | null) => (w === null ? null : dezimal(w.toString()));

/** Energieausweise und Verbräuche der sichtbaren Häuser (optional nur eines). */
export async function ladeEnergie(kontext: Kontext, filter: { hausId?: string } = {}): Promise<{ stichtag: IsoDatum; haeuser: EnergieHaus[] }> {
  const sicht = await bereichsSicht(kontext);
  const stichtag = heute();
  const haeuser = await kontext.db.haus.findMany({
    where: { id: filter.hausId ? (sicht.hausIds === "alle" || sicht.hausIds.includes(filter.hausId) ? filter.hausId : { in: [] }) : idFilter(sicht.hausIds) },
    orderBy: { bezeichnung: "asc" },
    select: {
      id: true,
      bezeichnung: true,
      gesellschaft: { select: { name: true } },
      einheiten: { where: { art: { not: "STELLPLATZ" } }, select: { flaeche: true } },
      energieausweise: { orderBy: [{ gueltigBis: "desc" }] },
      energieverbraeuche: { orderBy: [{ jahr: "asc" }, { medium: "asc" }] },
    },
  });
  return {
    stichtag,
    haeuser: haeuser.map((h) => {
      const ausweise = h.energieausweise.map((a) => ({
        id: a.id,
        art: a.art,
        energieklasse: a.energieklasse,
        endenergie: d(a.endenergie),
        primaerenergie: d(a.primaerenergie),
        energietraeger: a.energietraeger,
        ausgestelltAm: isoDatum(a.ausgestelltAm),
        gueltigBis: isoDatum(a.gueltigBis),
        quelle: a.quelle,
        registriernummer: a.registriernummer,
        notiz: a.notiz,
        erstelltVon: a.erstelltVon,
      }));
      const massgeblich = massgeblicherAusweis(ausweise);
      return {
        id: h.id,
        bezeichnung: h.bezeichnung,
        gesellschaft: h.gesellschaft.name,
        flaeche: { summe: h.einheiten.reduce((s, e) => s.plus(dezimal(e.flaeche.toString())), dezimal(0)), fehlend: 0 },
        ausweise,
        massgeblich,
        status: ausweisStatus(massgeblich, stichtag),
        verbraeuche: h.energieverbraeuche.map((v) => ({
          id: v.id,
          jahr: v.jahr,
          medium: v.medium,
          menge: dezimal(v.menge.toString()),
          kosten: d(v.kosten),
          co2Kg: d(v.co2Kg),
          quelle: v.quelle,
          energietraeger: v.energietraeger,
          notiz: v.notiz,
        })),
      };
    }),
  };
}
