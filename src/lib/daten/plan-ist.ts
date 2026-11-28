import "server-only";
import { bereichsSicht } from "@/lib/auth/auswahl";
import type { Kontext } from "@/lib/auth/kontext";
import { idFilter } from "@/lib/auth/sichtbarkeit";
import { isoDatum, type IsoDatum } from "@/lib/datum";
import { GUV_POSTEN } from "@/lib/finanzen";
import { dezimal, type Decimal } from "@/lib/geld";
import {
  planIst,
  type PlanIst,
  type PlanWerte,
  type PlanZeile,
} from "@/lib/plan-ist";

type Roh = Partial<
  Record<(typeof GUV_POSTEN)[number], { toString(): string } | null>
>;
const werte = (z: Roh): PlanWerte =>
  Object.fromEntries(
    GUV_POSTEN.map((p) => [p, z[p] == null ? null : dezimal(z[p]!.toString())]),
  ) as PlanWerte;

export interface PlanjahrZeile {
  id: string;
  jahr: number;
  status: "ENTWURF" | "BESCHLOSSEN";
  quelle: string | null;
  beschlossenAm: IsoDatum | null;
  notiz: string | null;
  erstelltVon: string | null;
  gesellschaftId: string;
  gesellschaft: string;
  plan: PlanWerte;
  ist: {
    id: string;
    status: "ENDGUELTIG" | "ENTWURF";
    quelle: string;
    quelleText: string | null;
    ende: IsoDatum;
    werte: PlanWerte;
  } | null;
  erklaerungen: Partial<
    Record<PlanZeile, { text: string; von: string | null; am: IsoDatum }>
  >;
  /** Zinsbuchungen der Kredite der Gesellschaft im Kalenderjahr (Erklärungshilfe für den Zinsaufwand) */
  zinsbuchungen: { summe: Decimal; anzahl: number };
  ergebnis: PlanIst;
}

/** Pläne der sichtbaren Gesellschaften mit Ist aus dem Geschäftsjahr gleichen Jahres (neueste zuerst). */
export async function ladePlanjahre(
  kontext: Kontext,
  filter: { id?: string; gesellschaftId?: string } = {},
): Promise<PlanjahrZeile[]> {
  const sicht = await bereichsSicht(kontext);
  const plaene = await kontext.db.planjahr.findMany({
    where: {
      id: filter.id,
      gesellschaftId: filter.gesellschaftId,
      gesellschaft: { id: idFilter(sicht.gesellschaftIds) },
    },
    orderBy: [{ jahr: "desc" }, { gesellschaft: { name: "asc" } }],
    include: {
      gesellschaft: { select: { id: true, name: true } },
      erklaerungen: true,
    },
  });
  if (plaene.length === 0) return [];
  const gIds = [...new Set(plaene.map((p) => p.gesellschaftId))];
  const jahre = [...new Set(plaene.map((p) => p.jahr))];
  const [abschluesse, buchungen] = await Promise.all([
    kontext.db.geschaeftsjahr.findMany({
      where: { gesellschaftId: { in: gIds }, jahr: { in: jahre } },
    }),
    kontext.db.kreditbuchung.findMany({
      where: {
        art: "ZINS",
        kredit: { gesellschaftId: { in: gIds } },
        datum: {
          gte: new Date(`${Math.min(...jahre)}-01-01T00:00:00Z`),
          lte: new Date(`${Math.max(...jahre)}-12-31T00:00:00Z`),
        },
      },
      select: {
        datum: true,
        betrag: true,
        kredit: { select: { gesellschaftId: true } },
      },
    }),
  ]);
  return plaene.map((p) => {
    const a = abschluesse.find(
      (x) => x.gesellschaftId === p.gesellschaftId && x.jahr === p.jahr,
    );
    const ist = a
      ? {
          id: a.id,
          status: a.status,
          quelle: a.quelle,
          quelleText: a.quelleText,
          ende: isoDatum(a.ende)!,
          werte: werte(a),
        }
      : null;
    const plan = werte(p);
    const erkl = Object.fromEntries(
      p.erklaerungen.map((e) => [
        e.zeile,
        { text: e.text, von: e.erstelltVon, am: isoDatum(e.geaendertAm)! },
      ]),
    ) as PlanjahrZeile["erklaerungen"];
    const zins = buchungen.filter(
      (b) =>
        b.kredit.gesellschaftId === p.gesellschaftId &&
        b.datum.getUTCFullYear() === p.jahr,
    );
    return {
      id: p.id,
      jahr: p.jahr,
      status: p.status,
      quelle: p.quelle,
      beschlossenAm: isoDatum(p.beschlossenAm),
      notiz: p.notiz,
      erstelltVon: p.erstelltVon,
      gesellschaftId: p.gesellschaftId,
      gesellschaft: p.gesellschaft.name,
      plan,
      ist,
      erklaerungen: erkl,
      zinsbuchungen: {
        summe: zins.reduce(
          (s, b) => s.plus(dezimal(b.betrag.toString()).abs()),
          dezimal(0),
        ),
        anzahl: zins.length,
      },
      ergebnis: planIst(
        plan,
        ist?.werte ?? null,
        Object.fromEntries(Object.entries(erkl).map(([k, v]) => [k, v!.text])),
      ),
    };
  });
}
