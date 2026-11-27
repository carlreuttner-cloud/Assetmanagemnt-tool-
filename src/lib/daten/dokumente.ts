import "server-only";
import { fuelle, texte } from "@/i18n";
import type { Kontext } from "@/lib/auth/kontext";
import { idFilter, sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { alsDbDatum, formatDatum, heute, isoDatum, type IsoDatum } from "@/lib/datum";
import { dokumentStatus, zaehleStatus, type AutomatischerStand, type Bezug, type DokumentBewertung } from "@/lib/dokumente";

export type ChecklistenObjekt = { bezug: Bezug; id: string; name: string; unter: string | null; href: string };
export type ChecklistenZelle = {
  vorgabe: { id: string; name: string; gueltigMonate: number | null; automatik: string | null; beschreibung: string | null };
  nachweis: { id: string; vorhanden: boolean; nichtErforderlich: boolean; dokumentDatum: IsoDatum | null; ablageort: string | null; notiz: string | null } | null;
  bewertung: DokumentBewertung;
};

/**
 * Lädt die Checkliste für den sichtbaren Ausschnitt (optional nur ein Objekt): aktive Vorgaben,
 * erfasste Nachweise und den automatischen Stand aus Gutachten, Jahresabschlüssen und Saldenbestätigungen.
 */
export async function ladeCheckliste(kontext: Kontext, nur?: { bezug: Bezug; id: string }) {
  const { db } = kontext;
  const t = texte(kontext.mandant.sprache);
  const sprache = kontext.mandant.sprache;
  const sicht = await sichtbarkeit(kontext);
  const stichtag = heute();
  const gFilter = idFilter(sicht.gesellschaftIds);
  const hFilter = idFilter(sicht.hausIds);

  const [vorgaben, gesellschaften, haeuser, kredite] = await Promise.all([
    db.dokumentvorgabe.findMany({ where: { aktiv: true }, orderBy: [{ bezug: "asc" }, { reihenfolge: "asc" }, { name: "asc" }] }),
    !nur || nur.bezug === "GESELLSCHAFT"
      ? db.gesellschaft.findMany({
          where: { id: nur ? (sicht.gesellschaftIds === "alle" || sicht.gesellschaftIds.includes(nur.id) ? nur.id : { in: [] }) : gFilter },
          orderBy: { name: "asc" },
          select: { id: true, name: true, abschluesse: { where: { quelle: "JAHRESABSCHLUSS", status: "ENDGUELTIG" }, orderBy: { ende: "desc" }, take: 1, select: { jahr: true, ende: true } } },
        })
      : [],
    !nur || nur.bezug === "HAUS"
      ? db.haus.findMany({
          where: { id: nur ? (sicht.hausIds === "alle" || sicht.hausIds.includes(nur.id) ? nur.id : { in: [] }) : hFilter },
          orderBy: { bezeichnung: "asc" },
          select: { id: true, bezeichnung: true, gesellschaft: { select: { name: true } }, gutachten: { where: { stichtag: { lte: alsDbDatum(stichtag) } }, orderBy: { stichtag: "desc" }, take: 1, select: { stichtag: true } } },
        })
      : [],
    !nur || nur.bezug === "KREDIT"
      ? db.kredit.findMany({
          where: { id: nur?.id, gesellschaftId: gFilter },
          orderBy: { bezeichnung: "asc" },
          select: {
            id: true,
            bezeichnung: true,
            bank: true,
            salden: { where: { quelle: "BANKBESTAETIGUNG", status: "BELEGT", art: "DARLEHEN", stichtag: { not: null } }, orderBy: { stichtag: "desc" }, take: 1, select: { stichtag: true } },
          },
        })
      : [],
  ]);

  const objekte: Array<ChecklistenObjekt & { auto: Partial<Record<string, AutomatischerStand>> }> = [
    ...gesellschaften.map((g) => {
      const ja = g.abschluesse[0];
      return {
        bezug: "GESELLSCHAFT" as const,
        id: g.id,
        name: g.name,
        unter: null,
        href: `/gesellschaften/${g.id}`,
        auto: ja ? { JAHRESABSCHLUSS: { datum: isoDatum(ja.ende), beschreibung: fuelle(t.dokumente.autoJahresabschluss, { jahr: ja.jahr, datum: formatDatum(ja.ende, sprache) }) } } : {},
      };
    }),
    ...haeuser.map((h) => {
      const ga = h.gutachten[0];
      return {
        bezug: "HAUS" as const,
        id: h.id,
        name: h.bezeichnung,
        unter: h.gesellschaft.name,
        href: `/haeuser/${h.id}`,
        auto: ga ? { GUTACHTEN: { datum: isoDatum(ga.stichtag), beschreibung: fuelle(t.dokumente.autoGutachten, { datum: formatDatum(ga.stichtag, sprache) }) } } : {},
      };
    }),
    ...kredite.map((k) => {
      const s = k.salden[0];
      return {
        bezug: "KREDIT" as const,
        id: k.id,
        name: k.bezeichnung,
        unter: k.bank,
        href: `/gesellschaften/kredite/${k.id}`,
        auto: s?.stichtag ? { SALDENBESTAETIGUNG: { datum: isoDatum(s.stichtag), beschreibung: fuelle(t.dokumente.autoSaldenbestaetigung, { datum: formatDatum(s.stichtag, sprache) }) } } : {},
      };
    }),
  ];

  const ids = objekte.map((o) => o.id);
  const nachweise = await db.dokumentnachweis.findMany({
    where: { OR: [{ gesellschaftId: { in: ids } }, { hausId: { in: ids } }, { kreditId: { in: ids } }] },
  });
  const nachweisVon = new Map(nachweise.map((n) => [`${n.vorgabeId}|${n.gesellschaftId ?? n.hausId ?? n.kreditId}`, n]));

  const zeilen = objekte.map((o) => {
    const zellen: ChecklistenZelle[] = vorgaben
      .filter((v) => v.bezug === o.bezug)
      .map((v) => {
        const n = nachweisVon.get(`${v.id}|${o.id}`) ?? null;
        const nachweis = n
          ? { id: n.id, vorhanden: n.vorhanden, nichtErforderlich: n.nichtErforderlich, dokumentDatum: isoDatum(n.dokumentDatum), ablageort: n.ablageort, notiz: n.notiz }
          : null;
        const auto = v.automatik ? (o.auto[v.automatik] ?? null) : null;
        return {
          vorgabe: { id: v.id, name: v.name, gueltigMonate: v.gueltigMonate, automatik: v.automatik, beschreibung: v.beschreibung },
          nachweis,
          bewertung: dokumentStatus(v, nachweis, auto, stichtag),
        };
      });
    return { objekt: { bezug: o.bezug, id: o.id, name: o.name, unter: o.unter, href: o.href } satisfies ChecklistenObjekt, zellen, zaehlung: zaehleStatus(zellen.map((z) => z.bewertung.status)) };
  });

  return { stichtag, vorgaben, zeilen, zaehlung: zaehleStatus(zeilen.flatMap((z) => z.zellen.map((c) => c.bewertung.status))) };
}

export type Checkliste = Awaited<ReturnType<typeof ladeCheckliste>>;
