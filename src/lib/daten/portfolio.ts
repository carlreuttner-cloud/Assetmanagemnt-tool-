import "server-only";
import type { Kontext } from "@/lib/auth/kontext";
import { idFilter, sichtbarkeit, type Sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { isoDatum } from "@/lib/datum";
import { dezimal } from "@/lib/geld";
import type { HausDaten } from "@/lib/kennzahlen";
import type { KreditDaten, ReferenzWert } from "@/lib/kredit";

/**
 * Lädt die Rechengrundlage (Häuser mit Einheiten und Mietverhältnissen, Kredite mit
 * Buchungen und Tilgungsplänen, Referenzzinsen) für den sichtbaren Ausschnitt des Mandanten.
 * Für Hausverwaltung und Investoren wird automatisch nach `sichtbarkeit()` gefiltert.
 */
export async function ladeRechengrundlage(
  kontext: Kontext,
  filter: { gesellschaftId?: string; hausId?: string; kreditId?: string } = {},
): Promise<{ haeuser: HausDaten[]; kredite: KreditDaten[]; referenzwerte: ReferenzWert[]; sicht: Sichtbarkeit }> {
  const { db } = kontext;
  const sicht = await sichtbarkeit(kontext);

  const [haeuser, kredite, referenz] = await Promise.all([
    db.haus.findMany({
      where: { id: erlaubt(sicht.hausIds, filter.hausId), gesellschaftId: filter.gesellschaftId },
      select: {
        id: true,
        gesellschaftId: true,
        kaufpreis: true,
        verkehrswerte: { select: { stichtag: true, wert: true } },
        einheiten: {
          select: {
            id: true,
            art: true,
            flaeche: true,
            erwarteteMiete: true,
            mietverhaeltnisse: { select: { beginn: true, ende: true, istMiete: true, sollMiete: true, rueckstand: true } },
          },
        },
      },
    }),
    db.kredit.findMany({
      where: {
        id: filter.kreditId,
        gesellschaftId: erlaubt(sicht.gesellschaftIds, filter.gesellschaftId),
        ...(filter.hausId ? { haeuser: { some: { hausId: filter.hausId } } } : {}),
      },
      include: {
        haeuser: { select: { hausId: true, anteilProzent: true } },
        buchungen: { select: { datum: true, art: true, betrag: true, saldoNach: true } },
        tilgungsplaene: { select: { version: true, gueltigAb: true, zeilen: true } },
      },
    }),
    db.referenzzinssatz.findMany({ select: { referenz: true, stichtag: true, satz: true } }),
  ]);

  return {
    sicht,
    haeuser: haeuser.map(
      (h): HausDaten => ({
        id: h.id,
        gesellschaftId: h.gesellschaftId,
        kaufpreis: h.kaufpreis ? dezimal(h.kaufpreis) : null,
        verkehrswerte: h.verkehrswerte.map((v) => ({ stichtag: isoDatum(v.stichtag), wert: dezimal(v.wert) })),
        einheiten: h.einheiten.map((e) => ({
          id: e.id,
          art: e.art,
          flaeche: dezimal(e.flaeche),
          erwarteteMiete: e.erwarteteMiete ? dezimal(e.erwarteteMiete) : null,
          mietverhaeltnisse: e.mietverhaeltnisse.map((m) => ({
            beginn: isoDatum(m.beginn),
            ende: isoDatum(m.ende),
            istMiete: dezimal(m.istMiete),
            sollMiete: dezimal(m.sollMiete),
            rueckstand: dezimal(m.rueckstand),
          })),
        })),
      }),
    ),
    kredite: kredite.map(alsKreditDaten),
    referenzwerte: referenz.map((r) => ({ referenz: r.referenz, stichtag: isoDatum(r.stichtag), satz: dezimal(r.satz) })),
  };
}

/** Prisma-Bedingung: gewünschte ID, aber nur innerhalb der sichtbaren IDs. */
export function erlaubt(ids: string[] | "alle", gewuenscht?: string) {
  if (!gewuenscht) return idFilter(ids);
  if (ids !== "alle" && !ids.includes(gewuenscht)) return { in: [] as string[] };
  return gewuenscht;
}

type KreditZeile = {
  id: string;
  gesellschaftId: string;
  bezeichnung: string;
  zinsArt: "FEST" | "VARIABEL";
  sollzins: { toFixed(): string } | null;
  referenzzins: string | null;
  marge: { toFixed(): string } | null;
  ursprungsbetrag: { toFixed(): string };
  auszahlungsdatum: Date | null;
  zinsbindungBis: Date | null;
  laufzeitBis: Date | null;
  zahlweise: KreditDaten["zahlweise"];
  tilgungsart: KreditDaten["tilgungsart"];
  anfaenglicheTilgung: { toFixed(): string } | null;
  ratenbetrag: { toFixed(): string } | null;
  haeuser: { hausId: string; anteilProzent: { toFixed(): string } }[];
  buchungen: { datum: Date; art: KreditDaten["buchungen"][number]["art"]; betrag: { toFixed(): string }; saldoNach: { toFixed(): string } | null }[];
  tilgungsplaene: {
    version: number;
    gueltigAb: Date;
    zeilen: { faelligAm: Date; zins: { toFixed(): string }; tilgung: { toFixed(): string }; rate: { toFixed(): string }; restschuld: { toFixed(): string } }[];
  }[];
};

export function alsKreditDaten(k: KreditZeile): KreditDaten {
  const d = (w: { toFixed(): string } | null) => (w ? dezimal(w) : null);
  return {
    id: k.id,
    gesellschaftId: k.gesellschaftId,
    bezeichnung: k.bezeichnung,
    zinsArt: k.zinsArt,
    sollzins: d(k.sollzins),
    referenzzins: k.referenzzins,
    marge: d(k.marge),
    ursprungsbetrag: dezimal(k.ursprungsbetrag),
    auszahlungsdatum: isoDatum(k.auszahlungsdatum),
    zinsbindungBis: isoDatum(k.zinsbindungBis),
    laufzeitBis: isoDatum(k.laufzeitBis),
    zahlweise: k.zahlweise,
    tilgungsart: k.tilgungsart,
    anfaenglicheTilgung: d(k.anfaenglicheTilgung),
    ratenbetrag: d(k.ratenbetrag),
    haeuser: k.haeuser.map((x) => ({ hausId: x.hausId, anteilProzent: dezimal(x.anteilProzent) })),
    buchungen: k.buchungen.map((b) => ({ datum: isoDatum(b.datum), art: b.art, betrag: dezimal(b.betrag), saldoNach: d(b.saldoNach) })),
    tilgungsplaene: k.tilgungsplaene.map((t) => ({
      version: t.version,
      gueltigAb: isoDatum(t.gueltigAb),
      zeilen: t.zeilen.map((z) => ({
        faelligAm: isoDatum(z.faelligAm),
        zins: dezimal(z.zins),
        tilgung: dezimal(z.tilgung),
        rate: dezimal(z.rate),
        restschuld: dezimal(z.restschuld),
      })),
    })),
  };
}
