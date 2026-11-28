import "server-only";
import type { Kontext } from "@/lib/auth/kontext";
import { idFilter, sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { isoDatum } from "@/lib/datum";
import { ordneDokumente, type DatenraumDokument, type DatenraumEintrag, type Ordnernamen, type PaketArt } from "@/lib/datenraum";
import { dokumentFilter } from "./dateien";
import { ladeCheckliste, type Checkliste } from "./dokumente";

export interface Datenraum {
  art: PaketArt;
  id: string;
  name: string;
  /** Gesellschaft des Hauses bzw. die Gesellschaft selbst */
  gesellschaft: string;
  eintraege: DatenraumEintrag[];
  /** nicht bestätigte Dokumente, die nicht enthalten sind */
  ausgelassen: number;
  bytes: number;
  pflicht: Checkliste["zeilen"];
  speicherPfade: Map<string, string>;
}

/**
 * Unterlagen eines Hauses (mit Einheiten, Mietverhältnissen und zugeordneten Krediten) oder einer
 * Gesellschaft (mit Krediten und allen Häusern) im sichtbaren Ausschnitt, geordnet für den Datenraum.
 * null, wenn das Objekt nicht sichtbar ist.
 */
export async function ladeDatenraum(kontext: Kontext, art: PaketArt, id: string, namen: Ordnernamen, optionen: { unbestaetigt: boolean }): Promise<Datenraum | null> {
  const sicht = await sichtbarkeit(kontext);
  const { db } = kontext;
  let name: string;
  let gesellschaft: string;
  let haeuser: string[];
  let kredite: string[];
  let gesellschaftId: string | null;
  if (art === "gesellschaft") {
    const g = await db.gesellschaft.findFirst({
      where: { id: sicht.gesellschaftIds === "alle" || sicht.gesellschaftIds.includes(id) ? id : { in: [] } },
      select: { id: true, name: true, haeuser: { where: { id: idFilter(sicht.hausIds) }, select: { id: true } }, kredite: { select: { id: true } } },
    });
    if (!g) return null;
    name = g.name;
    gesellschaft = g.name;
    haeuser = g.haeuser.map((h) => h.id);
    kredite = g.kredite.map((k) => k.id);
    gesellschaftId = g.id;
  } else {
    const h = await db.haus.findFirst({
      where: { id: sicht.hausIds === "alle" || sicht.hausIds.includes(id) ? id : { in: [] } },
      select: { id: true, bezeichnung: true, gesellschaft: { select: { name: true } }, kredite: { select: { kreditId: true } } },
    });
    if (!h) return null;
    name = h.bezeichnung;
    gesellschaft = h.gesellschaft.name;
    haeuser = [h.id];
    kredite = h.kredite.map((k) => k.kreditId);
    gesellschaftId = null;
  }

  const bezug = {
    OR: [
      ...(gesellschaftId ? [{ gesellschaftId }] : []),
      { kreditId: { in: kredite } },
      { hausId: { in: haeuser } },
      { einheit: { hausId: { in: haeuser } } },
      { mietverhaeltnis: { einheit: { hausId: { in: haeuser } } } },
    ],
  };
  const where = { AND: [dokumentFilter(sicht), bezug] };
  const [dokumente, ausgelassen, checkliste] = await Promise.all([
    db.dokument.findMany({
      where: optionen.unbestaetigt ? where : { AND: [...where.AND, { bestaetigt: true }] },
      select: {
        id: true,
        titel: true,
        kategorie: true,
        jahr: true,
        dokumentDatum: true,
        dateiname: true,
        mimeType: true,
        groesseBytes: true,
        pruefsumme: true,
        bestaetigt: true,
        absenderName: true,
        speicherPfad: true,
        gesellschaft: { select: { name: true } },
        haus: { select: { bezeichnung: true } },
        einheit: { select: { bezeichnung: true, haus: { select: { bezeichnung: true } } } },
        mietverhaeltnis: { select: { mieter: { select: { name: true } }, einheit: { select: { bezeichnung: true, haus: { select: { bezeichnung: true } } } } } },
        kredit: { select: { bezeichnung: true } },
      },
    }),
    optionen.unbestaetigt ? Promise.resolve(0) : db.dokument.count({ where: { AND: [...where.AND, { bestaetigt: false }] } }),
    ladeCheckliste(kontext),
  ]);

  const liste: DatenraumDokument[] = dokumente.map((d) => {
    const einheit = d.mietverhaeltnis?.einheit ?? d.einheit;
    return {
      id: d.id,
      titel: d.titel,
      kategorie: d.kategorie,
      jahr: d.jahr,
      dokumentDatum: isoDatum(d.dokumentDatum),
      dateiname: d.dateiname,
      mimeType: d.mimeType,
      groesseBytes: d.groesseBytes,
      pruefsumme: d.pruefsumme,
      bestaetigt: d.bestaetigt,
      absender: d.absenderName,
      gesellschaft: d.gesellschaft?.name ?? null,
      haus: d.haus?.bezeichnung ?? einheit?.haus.bezeichnung ?? null,
      einheit: einheit?.bezeichnung ?? null,
      mieter: d.mietverhaeltnis?.mieter.name ?? null,
      kredit: d.kredit?.bezeichnung ?? null,
    };
  });
  const objektIds = new Set([...(gesellschaftId ? [gesellschaftId] : []), ...haeuser, ...kredite]);
  return {
    art,
    id,
    name,
    gesellschaft,
    eintraege: ordneDokumente(liste, art, namen, `Datenraum ${name}`),
    ausgelassen,
    bytes: liste.reduce((s, d) => s + d.groesseBytes, 0),
    pflicht: checkliste.zeilen.filter((z) => objektIds.has(z.objekt.id)),
    speicherPfade: new Map(dokumente.map((d) => [d.id, d.speicherPfad])),
  };
}
