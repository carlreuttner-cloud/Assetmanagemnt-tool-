import "server-only";
import { bereichsSicht } from "@/lib/auth/auswahl";
import type { Kontext } from "@/lib/auth/kontext";
import { idFilter } from "@/lib/auth/sichtbarkeit";
import { isoDatum, type IsoDatum } from "@/lib/datum";
import { dezimal, type Decimal } from "@/lib/geld";
import { entgangenSeit, leerSeit, zuordnungAm, type LeerSeit, type Zuordnung } from "@/lib/hausverwaltung";
import { istAktiv } from "@/lib/kennzahlen";
import { inFlaeche, type Nutzungsart } from "@/lib/nutzungsart";

export interface ZuordnungMitName extends Zuordnung {
  id: string;
  name: string;
  notiz: string | null;
}

/** Zuordnungen der sichtbaren Häuser mit Namen der Hausverwaltung. */
export async function ladeZuordnungen(kontext: Kontext): Promise<ZuordnungMitName[]> {
  const sicht = await bereichsSicht(kontext);
  const liste = await kontext.db.hausverwaltungZuordnung.findMany({
    where: { hausId: idFilter(sicht.hausIds) },
    orderBy: { von: "asc" },
    include: { hausverwaltung: { select: { name: true } } },
  });
  return liste.map((z) => ({ id: z.id, hausId: z.hausId, hausverwaltungId: z.hausverwaltungId, von: isoDatum(z.von), bis: isoDatum(z.bis), name: z.hausverwaltung.name, notiz: z.notiz }));
}

/** Aktuelle Hausverwaltung je Haus. */
export function verwaltungJeHaus(zuordnungen: ZuordnungMitName[], stichtag: IsoDatum) {
  const ergebnis = new Map<string, { id: string; name: string }>();
  for (const hausId of new Set(zuordnungen.map((z) => z.hausId))) {
    const z = zuordnungAm(zuordnungen, hausId, stichtag);
    if (z) ergebnis.set(hausId, { id: z.hausverwaltungId, name: z.name });
  }
  return ergebnis;
}

/** Wert für den Filter `hv`: eine Hausverwaltung oder "ohne" (Häuser ohne Hausverwaltung). */
export function passtZuHv(hv: string | undefined, verwaltung: { id: string } | undefined) {
  if (!hv) return true;
  if (hv === "ohne") return !verwaltung;
  return verwaltung?.id === hv;
}

/** Hausverwaltungen für Filter-Auswahl: nur solche mit sichtbaren Häusern (bei eingeschränkter Sicht). */
export async function ladeHausverwaltungen(kontext: Kontext) {
  const sicht = await bereichsSicht(kontext);
  return kontext.db.hausverwaltung.findMany({
    where: sicht.hausIds === "alle" ? {} : { zuordnungen: { some: { hausId: { in: sicht.hausIds } } } },
    orderBy: { name: "asc" },
  });
}

export interface LeerstandZeile {
  einheitId: string;
  einheit: string;
  lage: string | null;
  hausId: string;
  haus: string;
  art: Nutzungsart;
  flaeche: Decimal;
  erwarteteMiete: Decimal | null;
  seit: LeerSeit | null;
  /** Tag nach dem letzten Mietende, falls bekannt (für die Herleitung) */
  letztesEnde: IsoDatum | null;
  entgangenSeit: Decimal | null;
}

export interface HausBestand {
  hausId: string;
  haus: string;
  einheiten: number;
  flaeche: Decimal;
  leerFlaeche: Decimal;
  leere: LeerstandZeile[];
}

/**
 * Aktueller Bestand und Leerstand der Häuser zum Stichtag. Der Leerstandsbeginn kommt aus dem
 * letzten Mietende, sonst aus den gespeicherten Ständen („spätestens seit“).
 */
export async function ladeHausBestand(kontext: Kontext, hausIds: string[], stichtag: IsoDatum): Promise<HausBestand[]> {
  if (hausIds.length === 0) return [];
  const [haeuser, staende] = await Promise.all([
    kontext.db.haus.findMany({
      where: { id: { in: hausIds } },
      orderBy: { bezeichnung: "asc" },
      select: {
        id: true,
        bezeichnung: true,
        einheiten: { orderBy: { bezeichnung: "asc" }, select: { id: true, bezeichnung: true, lage: true, art: true, flaeche: true, erwarteteMiete: true, mietverhaeltnisse: { select: { beginn: true, ende: true } } } },
      },
    }),
    kontext.db.mieterstand.findMany({
      where: { hausId: { in: hausIds } },
      orderBy: [{ stichtag: "desc" }, { erstelltAm: "desc" }],
      select: { stichtag: true, hausId: true, zeilen: { select: { einheitId: true, leer: true } } },
    }),
  ]);
  // je Einheit: Leer-Kennzeichen je Stichtag (bei mehreren Ständen gleichen Tags der neueste)
  const verlauf = new Map<string, Map<IsoDatum, boolean | null>>();
  for (const s of staende) {
    const tag = isoDatum(s.stichtag);
    for (const z of s.zeilen) {
      if (!z.einheitId) continue;
      const m = verlauf.get(z.einheitId) ?? new Map<IsoDatum, boolean | null>();
      if (!m.has(tag)) m.set(tag, z.leer);
      verlauf.set(z.einheitId, m);
    }
  }
  return haeuser.map((h) => {
    let flaeche = dezimal(0);
    let leerFlaeche = dezimal(0);
    const leere: LeerstandZeile[] = [];
    for (const e of h.einheiten) {
      const art = e.art as Nutzungsart;
      const fl = dezimal(e.flaeche);
      if (inFlaeche(art)) flaeche = flaeche.plus(fl);
      const vermietet = e.mietverhaeltnisse.some((m) => istAktiv({ beginn: isoDatum(m.beginn), ende: isoDatum(m.ende) }, stichtag));
      if (vermietet) continue;
      if (inFlaeche(art)) leerFlaeche = leerFlaeche.plus(fl);
      const enden = e.mietverhaeltnisse.map((m) => isoDatum(m.ende));
      const seit = leerSeit(enden, [...(verlauf.get(e.id) ?? new Map()).entries()].map(([s, leer]) => ({ stichtag: s, leer })), stichtag);
      const erwartet = e.erwarteteMiete ? dezimal(e.erwarteteMiete) : null;
      leere.push({
        einheitId: e.id,
        einheit: e.bezeichnung,
        lage: e.lage,
        hausId: h.id,
        haus: h.bezeichnung,
        art,
        flaeche: fl,
        erwarteteMiete: erwartet,
        seit,
        letztesEnde: enden.filter((x): x is IsoDatum => !!x && x < stichtag).sort().at(-1) ?? null,
        entgangenSeit: entgangenSeit(erwartet, seit),
      });
    }
    return { hausId: h.id, haus: h.bezeichnung, einheiten: h.einheiten.length, flaeche, leerFlaeche, leere };
  });
}
