import "server-only";
import type { Kontext } from "@/lib/auth/kontext";
import { sichtbarkeit, type Sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { ausschnitt, type ObjektKandidat } from "@/lib/dokument-vorschlag";

/**
 * Filter für sichtbare Dokumente: Wer alles sieht, sieht auch nicht zugeordnete Dokumente;
 * sonst nur Dokumente, die einer sichtbaren Gesellschaft, einem sichtbaren Haus oder einem Kredit
 * einer sichtbaren Gesellschaft zugeordnet sind.
 */
export function dokumentFilter(sicht: Sichtbarkeit) {
  if (sicht.gesellschaftIds === "alle" && sicht.hausIds === "alle") return {};
  const g = sicht.gesellschaftIds === "alle" ? undefined : sicht.gesellschaftIds;
  const h = sicht.hausIds === "alle" ? undefined : sicht.hausIds;
  return {
    OR: [
      ...(g ? [{ gesellschaftId: { in: g } }, { kredit: { gesellschaftId: { in: g } } }] : []),
      ...(h ? [{ hausId: { in: h } }] : []),
    ],
  };
}

/** Objekte, denen ein Dokument zugeordnet werden kann, mit Begriffen für die Erkennung im Text. */
export async function ladeZuordnungsKandidaten(kontext: Kontext): Promise<ObjektKandidat[]> {
  const sicht = await sichtbarkeit(kontext);
  const gFilter = sicht.gesellschaftIds === "alle" ? undefined : { in: sicht.gesellschaftIds };
  const hFilter = sicht.hausIds === "alle" ? undefined : { in: sicht.hausIds };
  const [gesellschaften, haeuser, kredite] = await Promise.all([
    kontext.db.gesellschaft.findMany({ where: { id: gFilter }, orderBy: { name: "asc" }, select: { id: true, name: true, registernummer: true } }),
    kontext.db.haus.findMany({ where: { id: hFilter }, orderBy: { bezeichnung: "asc" }, select: { id: true, bezeichnung: true, strasse: true } }),
    kontext.db.kredit.findMany({
      where: { gesellschaftId: gFilter },
      orderBy: { bezeichnung: "asc" },
      select: { id: true, bezeichnung: true, kreditnummer: true, iban: true, gesellschaft: { select: { name: true } } },
    }),
  ]);
  return [
    ...gesellschaften.map((g) => ({ art: "gesellschaft" as const, id: g.id, name: g.name, begriffe: [g.registernummer?.replace(/\s*\(.*\)$/, "") ?? ""] })),
    ...haeuser.map((h) => ({ art: "haus" as const, id: h.id, name: h.bezeichnung, begriffe: [h.strasse ?? ""] })),
    ...kredite.map((k) => ({ art: "kredit" as const, id: k.id, name: `${k.bezeichnung} (${k.gesellschaft.name})`, begriffe: [k.kreditnummer ?? "", k.iban ?? "", k.bezeichnung] })),
  ];
}

export type DokumentTreffer = {
  id: string;
  titel: string;
  dateiname: string;
  kategorie: string | null;
  objekt: string | null;
  seiten: Array<{ nummer: number; anzahl: number; ausschnitt: { vor: string; treffer: string; nach: string } | null }>;
  imTitel: boolean;
};

/** Volltextsuche in Titel, Dateiname und Text je Seite der sichtbaren Dokumente. */
export async function sucheDokumente(kontext: Kontext, begriff: string, maxDokumente = 50): Promise<DokumentTreffer[]> {
  const sicht = await sichtbarkeit(kontext);
  const filter = dokumentFilter(sicht);
  const ci = { contains: begriff, mode: "insensitive" as const };
  const dokumente = await kontext.db.dokument.findMany({
    where: { AND: [filter, { OR: [{ titel: ci }, { dateiname: ci }, { seiten: { some: { text: ci } } }] }] },
    orderBy: { erstelltAm: "desc" },
    take: maxDokumente,
    select: {
      id: true,
      titel: true,
      dateiname: true,
      kategorie: true,
      gesellschaft: { select: { name: true } },
      haus: { select: { bezeichnung: true } },
      kredit: { select: { bezeichnung: true } },
      seiten: { where: { text: ci }, orderBy: { nummer: "asc" }, select: { nummer: true, text: true } },
    },
  });
  const b = begriff.toLocaleLowerCase("de-DE");
  return dokumente.map((d) => ({
    id: d.id,
    titel: d.titel,
    dateiname: d.dateiname,
    kategorie: d.kategorie,
    objekt: d.gesellschaft?.name ?? d.haus?.bezeichnung ?? d.kredit?.bezeichnung ?? null,
    imTitel: d.titel.toLocaleLowerCase("de-DE").includes(b) || d.dateiname.toLocaleLowerCase("de-DE").includes(b),
    seiten: d.seiten.map((s) => ({ nummer: s.nummer, anzahl: s.text.toLocaleLowerCase("de-DE").split(b).length - 1, ausschnitt: ausschnitt(s.text, begriff) })),
  }));
}
