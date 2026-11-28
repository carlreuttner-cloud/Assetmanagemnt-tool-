import "server-only";
import type { Kontext } from "@/lib/auth/kontext";
import { alsDbDatum, isoDatum, type IsoDatum } from "@/lib/datum";
import { dezimal, zuText, type Decimal } from "@/lib/geld";
import type { ListenZeile } from "@/lib/import/mieterliste";
import {
  addiereSummen,
  istGeaendert,
  standAm,
  standSummen,
  vergleicheStaende,
  vorherigerStichtag,
  zusammenfassung,
  type Stand,
  type StandArt,
  type StandSummen,
  type StandZeile,
  type ZeilenVergleich,
} from "@/lib/mieterstand";
import type { Nutzungsart } from "@/lib/nutzungsart";

type Db = Kontext["db"];
const zahl = (w: { toString(): string } | null) => (w === null ? null : dezimal(w.toString()));

export interface GespeicherterStand extends Stand {
  erstelltAm: string;
  haus: string;
}

/** Alle Stände der sichtbaren (bzw. gewählten) Häuser, neueste zuerst. */
export async function ladeStaende(kontext: Kontext, hausFilter: string | { in: string[] } | undefined, gesellschaftId?: string): Promise<GespeicherterStand[]> {
  const liste = await kontext.db.mieterstand.findMany({
    where: { hausId: hausFilter, ...(gesellschaftId ? { haus: { gesellschaftId } } : {}) },
    orderBy: [{ stichtag: "desc" }, { erstelltAm: "desc" }],
    include: { haus: { select: { bezeichnung: true } }, zeilen: true },
  });
  return liste.map((s) => ({
    id: s.id,
    hausId: s.hausId,
    haus: s.haus.bezeichnung,
    stichtag: isoDatum(s.stichtag),
    art: s.art as StandArt,
    quelle: s.quelle,
    erstelltAm: s.erstelltAm.toISOString(),
    zeilen: s.zeilen
      .map(
        (z): StandZeile => ({
          schluessel: z.einheitId ?? z.einheit.toLowerCase(),
          einheit: z.einheit,
          art: z.art as Nutzungsart,
          flaeche: zahl(z.flaeche),
          leer: z.leer,
          mieter: z.mieter,
          beginn: isoDatum(z.beginn),
          ende: isoDatum(z.ende),
          sollMiete: zahl(z.sollMiete),
          istMiete: zahl(z.istMiete),
          nebenkosten: zahl(z.nebenkosten),
          erwarteteMiete: zahl(z.erwarteteMiete),
        }),
      )
      .sort((a, b) => a.einheit.localeCompare(b.einheit, "de", { numeric: true })),
  }));
}

export interface HausVergleich {
  hausId: string;
  haus: string;
  stand: GespeicherterStand;
  /** null: kein Stand zum Vergleichsdatum */
  vergleich: GespeicherterStand | null;
  zeilen: ZeilenVergleich[];
  summen: StandSummen;
  summenVergleich: StandSummen | null;
}

export interface StandAnsicht {
  stichtage: IsoDatum[];
  stichtag: IsoDatum | null;
  vergleichStichtag: IsoDatum | null;
  haeuser: HausVergleich[];
  summen: StandSummen | null;
  summenVergleich: StandSummen | null;
  zusammenfassung: ReturnType<typeof zusammenfassung>;
  /** Häuser, deren Stand nicht genau am gewählten Stichtag liegt */
  abweichendeStichtage: boolean;
}

/**
 * Stellt je Haus den neuesten Stand zum gewählten Stichtag dem Stand zum Vergleichsstichtag gegenüber.
 * Ohne Auswahl gilt der neueste Stichtag, verglichen mit dem davor.
 */
export function standAnsicht(staende: GespeicherterStand[], wahl: { stand?: string; vergleich?: string; filter?: (h: string) => boolean; art?: Nutzungsart }): StandAnsicht {
  const stichtage = [...new Set(staende.map((s) => s.stichtag))].sort().reverse();
  const stichtag = wahl.stand && stichtage.includes(wahl.stand) ? wahl.stand : (stichtage[0] ?? null);
  const vergleichStichtag =
    wahl.vergleich === "" || wahl.vergleich === "keiner" ? null : wahl.vergleich && stichtage.includes(wahl.vergleich) ? wahl.vergleich : stichtag ? vorherigerStichtag(stichtage, stichtag) : null;
  const nachHaus = new Map<string, GespeicherterStand[]>();
  // Nutzungsart-Filter der Seite gilt auch für Zeilen und Summen der Stände
  if (wahl.art) staende = staende.map((s) => ({ ...s, zeilen: s.zeilen.filter((z) => z.art === wahl.art) }));
  for (const s of staende) nachHaus.set(s.hausId, [...(nachHaus.get(s.hausId) ?? []), s]);
  const haeuser: HausVergleich[] = [];
  if (stichtag) {
    for (const [hausId, liste] of nachHaus) {
      if (wahl.filter && !wahl.filter(hausId)) continue;
      const stand = standAm(liste, stichtag);
      if (!stand) continue;
      const vergleich = vergleichStichtag ? standAm(liste, vergleichStichtag) : null;
      // derselbe Stand auf beiden Seiten: keine Änderungen
      const alt = vergleich && vergleich.id !== stand.id ? vergleich : vergleich ? stand : null;
      haeuser.push({
        hausId,
        haus: stand.haus,
        stand,
        vergleich,
        zeilen: vergleicheStaende(alt ? alt.zeilen : null, stand.zeilen),
        summen: standSummen(stand.zeilen),
        summenVergleich: vergleich ? standSummen(vergleich.zeilen) : null,
      });
    }
  }
  haeuser.sort((a, b) => a.haus.localeCompare(b.haus, "de"));
  const mitVergleich = haeuser.filter((h) => h.summenVergleich);
  return {
    stichtage,
    stichtag,
    vergleichStichtag,
    haeuser,
    summen: haeuser.length ? addiereSummen(haeuser.map((h) => h.summen)) : null,
    // Summen nur über Häuser mit Stand auf beiden Seiten vergleichen
    summenVergleich: vergleichStichtag && mitVergleich.length ? addiereSummen(mitVergleich.map((h) => h.summenVergleich!)) : null,
    zusammenfassung: zusammenfassung(haeuser.flatMap((h) => h.zeilen)),
    abweichendeStichtage: haeuser.some((h) => h.stand.stichtag !== stichtag || (vergleichStichtag && h.vergleich && h.vergleich.stichtag !== vergleichStichtag)),
  };
}

export { istGeaendert };

// ---------------------------------------------------------------------------
// Anlegen

export interface NeueStandZeile {
  einheitId: string | null;
  einheit: string;
  art: Nutzungsart;
  flaeche: Decimal | null;
  leer: boolean | null;
  mieter: string | null;
  beginn: IsoDatum | null;
  ende: IsoDatum | null;
  sollMiete: Decimal | null;
  istMiete: Decimal | null;
  nebenkosten: Decimal | null;
  erwarteteMiete: Decimal | null;
}

/** Legt einen neuen Stand an. Vorhandene Stände werden nie geändert. */
export async function legeStandAn(
  db: Db,
  stand: { hausId: string; stichtag: IsoDatum; art: StandArt; quelle: string; importvorgangId?: string | null; erstelltVon: string | null },
  zeilen: NeueStandZeile[],
) {
  const s = await db.mieterstand.create({
    data: { hausId: stand.hausId, stichtag: alsDbDatum(stand.stichtag), art: stand.art, quelle: stand.quelle, importvorgangId: stand.importvorgangId ?? null, erstelltVon: stand.erstelltVon } as never,
  });
  if (zeilen.length) {
    await db.mieterstandZeile.createMany({
      data: zeilen.map((z) => ({
        standId: s.id,
        einheitId: z.einheitId,
        einheit: z.einheit,
        art: z.art,
        flaeche: zuText(z.flaeche),
        leer: z.leer,
        mieter: z.mieter,
        beginn: z.beginn ? alsDbDatum(z.beginn) : null,
        ende: z.ende ? alsDbDatum(z.ende) : null,
        sollMiete: zuText(z.sollMiete),
        istMiete: zuText(z.istMiete),
        nebenkosten: zuText(z.nebenkosten),
        erwarteteMiete: zuText(z.erwarteteMiete),
      })) as never,
    });
  }
  return s.id;
}

/**
 * Zeilen eines Stands aus einer importierten Mieterliste. Werte stammen aus der Liste; Art und
 * Fläche fehlen dort oft und werden dann aus den Stammdaten der Einheit genommen.
 */
export async function standZeilenAusListe(db: Db, hausId: string, zeilen: ListenZeile[], stichtag: IsoDatum): Promise<NeueStandZeile[]> {
  const einheiten = await db.einheit.findMany({ where: { hausId }, select: { id: true, bezeichnung: true, art: true, flaeche: true, erwarteteMiete: true } });
  const nachName = new Map(einheiten.map((e) => [e.bezeichnung.toLowerCase().replace(/\s+/g, " ").trim(), e]));
  const ergebnis: NeueStandZeile[] = [];
  for (const z of zeilen) {
    const e = nachName.get(z.einheit.toLowerCase().replace(/\s+/g, " ").trim());
    const art = (z.art ?? e?.art) as Nutzungsart | undefined;
    if (!art) continue;
    // bereits ausgezogen: Einheit gilt zum Stichtag als leer
    const leer = z.mieter === null || (z.ende !== null && z.ende < stichtag);
    ergebnis.push({
      einheitId: e?.id ?? null,
      einheit: z.einheit,
      art,
      flaeche: z.flaeche ?? zahl(e?.flaeche ?? null),
      leer,
      mieter: leer ? null : z.mieter,
      beginn: leer ? null : z.beginn,
      ende: leer ? null : z.ende,
      sollMiete: leer ? null : z.sollMiete,
      istMiete: leer ? null : z.istMiete,
      nebenkosten: leer ? null : z.nebenkosten,
      erwarteteMiete: leer ? (z.erwarteteMiete ?? zahl(e?.erwarteteMiete ?? null)) : null,
    });
  }
  return ergebnis;
}
