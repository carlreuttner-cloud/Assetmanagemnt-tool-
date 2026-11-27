import "server-only";
import type { Kontext } from "@/lib/auth/kontext";
import { heute as heuteDatum, isoDatum, type IsoDatum } from "@/lib/datum";
import { dezimal } from "@/lib/geld";
import type { HausDaten } from "@/lib/kennzahlen";
import type { KreditDaten, ReferenzWert } from "@/lib/kredit";
import { rechneLiquiditaet, type KontostandDaten, type Liquiditaetsplan, type PlanpositionDaten } from "@/lib/liquiditaet";

export type LiquiditaetGesellschaft = {
  id: string;
  name: string;
  mindestliquiditaet: ReturnType<typeof dezimal> | null;
  kontostaende: KontostandDaten[];
  positionen: Array<PlanpositionDaten & { quelle: string | null }>;
  massnahmen: Map<string, { bezeichnung: string; hausId: string }>;
  plan: Liquiditaetsplan;
};

/**
 * Liquiditätspläne für die angegebenen Gesellschaften. Häuser, Kredite und Referenzzinsen kommen
 * aus `ladeRechengrundlage` (bereits nach Sichtbarkeit gefiltert); die Gesellschafts-IDs muss der
 * Aufrufer ebenfalls aus der Sichtbarkeit nehmen.
 */
export async function ladeLiquiditaet(
  kontext: Kontext,
  basis: { haeuser: HausDaten[]; kredite: KreditDaten[]; referenzwerte: ReferenzWert[] },
  gesellschaftIds: string[],
  heute: IsoDatum = heuteDatum(),
): Promise<LiquiditaetGesellschaft[]> {
  const hausIds = basis.haeuser.filter((h) => gesellschaftIds.includes(h.gesellschaftId)).map((h) => h.id);
  const [gesellschaften, massnahmen] = await Promise.all([
    kontext.db.gesellschaft.findMany({
      where: { id: { in: gesellschaftIds } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        mindestliquiditaet: true,
        kontostaende: { orderBy: [{ konto: "asc" }, { stichtag: "desc" }] },
        planpositionen: { orderBy: [{ monat: "asc" }, { art: "asc" }] },
      },
    }),
    kontext.db.massnahme.findMany({
      where: { hausId: { in: hausIds } },
      select: { id: true, hausId: true, bezeichnung: true, status: true, budget: true, beginn: true, ende: true, kosten: { select: { betrag: true } } },
    }),
  ]);
  const hausGesellschaft = new Map(basis.haeuser.map((h) => [h.id, h.gesellschaftId]));
  return gesellschaften.map((g) => {
    const eigene = massnahmen.filter((m) => hausGesellschaft.get(m.hausId) === g.id);
    const kontostaende = g.kontostaende.map((k) => ({ id: k.id, konto: k.konto, stichtag: isoDatum(k.stichtag), betrag: dezimal(k.betrag), quelle: k.quelle }));
    const positionen = g.planpositionen.map((p) => ({
      id: p.id,
      art: p.art,
      monat: isoDatum(p.monat),
      betrag: dezimal(p.betrag),
      bezeichnung: p.bezeichnung,
      quelle: p.quelle,
    }));
    const mindestliquiditaet = g.mindestliquiditaet === null ? null : dezimal(g.mindestliquiditaet);
    const plan = rechneLiquiditaet({
      haeuser: basis.haeuser.filter((h) => h.gesellschaftId === g.id),
      kredite: basis.kredite.filter((k) => k.gesellschaftId === g.id),
      referenzwerte: basis.referenzwerte,
      massnahmen: eigene.map((m) => ({
        id: m.id,
        bezeichnung: m.bezeichnung,
        status: m.status,
        budget: m.budget === null ? null : dezimal(m.budget),
        ist: m.kosten.reduce((s, k) => s.plus(k.betrag), dezimal(0)),
        beginn: isoDatum(m.beginn),
        ende: isoDatum(m.ende),
      })),
      positionen,
      kontostaende,
      mindestliquiditaet,
      heute,
    });
    return {
      id: g.id,
      name: g.name,
      mindestliquiditaet,
      kontostaende,
      positionen,
      massnahmen: new Map(eigene.map((m) => [m.id, { bezeichnung: m.bezeichnung, hausId: m.hausId }])),
      plan,
    };
  });
}
