import "server-only";
import type { Kontext } from "@/lib/auth/kontext";
import type { Sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import type { AngebotDaten } from "@/lib/bankangebot";
import { isoDatum } from "@/lib/datum";
import { dezimal } from "@/lib/geld";
import type { ReferenzWert } from "@/lib/kredit";

/** Angebote ohne Gesellschaft sieht nur, wer alle Gesellschaften sieht. */
export function angebotFilter(sicht: Sichtbarkeit) {
  return sicht.gesellschaftIds === "alle" ? {} : { gesellschaftId: { in: sicht.gesellschaftIds } };
}

type Zeile = {
  id: string;
  bank: string;
  bezeichnung: string | null;
  betrag: unknown;
  zinsArt: "FEST" | "VARIABEL";
  sollzins: unknown;
  referenzzins: string | null;
  marge: unknown;
  zinsbindungMonate: number | null;
  laufzeitMonate: number | null;
  zahlweise: AngebotDaten["zahlweise"];
  tilgungsart: AngebotDaten["tilgungsart"];
  tilgungProzent: unknown;
  auszahlungProzent: unknown;
  bearbeitungsgebuehr: unknown;
  sonstigeKosten: unknown;
};

const d = (w: unknown) => (w == null ? null : dezimal(String(w)));

export function alsAngebotDaten(z: Zeile): AngebotDaten {
  return {
    id: z.id,
    name: z.bezeichnung ? `${z.bank} – ${z.bezeichnung}` : z.bank,
    betrag: d(z.betrag),
    zinsArt: z.zinsArt,
    sollzins: d(z.sollzins),
    referenzzins: z.referenzzins,
    marge: d(z.marge),
    zinsbindungMonate: z.zinsbindungMonate,
    laufzeitMonate: z.laufzeitMonate,
    zahlweise: z.zahlweise,
    tilgungsart: z.tilgungsart,
    tilgungProzent: d(z.tilgungProzent),
    auszahlungProzent: d(z.auszahlungProzent),
    bearbeitungsgebuehr: d(z.bearbeitungsgebuehr),
    sonstigeKosten: d(z.sonstigeKosten),
  };
}

export async function ladeReferenzwerte(kontext: Kontext): Promise<ReferenzWert[]> {
  const werte = await kontext.db.referenzzinssatz.findMany({ select: { referenz: true, stichtag: true, satz: true } });
  return werte.map((r) => ({ referenz: r.referenz, stichtag: isoDatum(r.stichtag), satz: dezimal(r.satz) }));
}
