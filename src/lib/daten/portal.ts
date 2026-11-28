import "server-only";
import type { Kontext } from "@/lib/auth/kontext";
import { heute, isoDatum, type IsoDatum } from "@/lib/datum";
import { dezimal, type Decimal } from "@/lib/geld";
import { positionStand, type PositionStand } from "@/lib/kapitalabruf";
import { kontosummen, type Bewegung, type Kontosummen } from "@/lib/kapitalkonto";
import { rendite, type Rendite } from "@/lib/rendite";

export interface PortalKonto {
  id: string;
  name: string;
  gesellschaftId: string;
  gesellschaft: string;
  beteiligungProzent: Decimal | null;
  summen: Kontosummen;
  rendite: Rendite;
  bewegungen: Array<{ id: string; art: Bewegung["art"]; datum: IsoDatum | null; betrag: Decimal; quelle: string | null }>;
  abrufe: Array<{ id: string; bezeichnung: string; faelligAm: IsoDatum; betrag: Decimal; stand: PositionStand }>;
}

export interface Portal {
  mitgliedschaftId: string;
  investor: string;
  gesellschaften: Array<{ id: string; name: string; mitKonto: boolean }>;
  konten: PortalKonto[];
  berichte: Array<{ id: string; jahr: number; quartal: number; stichtag: IsoDatum; gesellschaft: string; freigegebenAm: Date | null }>;
  dokumente: Array<{ id: string; titel: string; kategorie: string | null; jahr: number | null; dokumentDatum: IsoDatum | null; zuordnung: string; freigegebenAm: Date }>;
}

/** Investoren-Mitgliedschaften des Mandanten (für die Vorschau durch Mitarbeiter). */
export async function ladeInvestoren(kontext: Kontext) {
  const m = await kontext.db.mitgliedschaft.findMany({ where: { rolle: "INVESTOR" }, select: { id: true, benutzer: { select: { name: true, email: true } } }, orderBy: { benutzer: { name: "asc" } } });
  return m.map((x) => ({ id: x.id, name: x.benutzer.name ?? x.benutzer.email }));
}

/**
 * Alles, was ein Investor im Portal sieht: nur die ihm zugewiesenen Gesellschaften, dort nur die mit
 * seiner Mitgliedschaft verknüpften Kapitalkonten, freigegebene Gesellschafts-Quartalsberichte und
 * ausdrücklich für Investoren freigegebene Dokumente. Ein Investor sieht immer nur sich selbst;
 * andere Rollen können eine Investoren-Mitgliedschaft zur Vorschau wählen.
 */
export async function ladePortal(kontext: Kontext, vorschauMitgliedschaftId?: string): Promise<Portal | null> {
  const { db } = kontext;
  const mitgliedschaftId = kontext.rolle === "INVESTOR" ? kontext.mitgliedschaftId : vorschauMitgliedschaftId;
  if (!mitgliedschaftId) return null;
  const m = await db.mitgliedschaft.findFirst({
    where: { id: mitgliedschaftId, rolle: "INVESTOR" },
    select: { id: true, benutzer: { select: { name: true, email: true } }, gesellschaftZuweisungen: { select: { gesellschaft: { select: { id: true, name: true } } } } },
  });
  if (!m) return null;
  const ids = m.gesellschaftZuweisungen.map((z) => z.gesellschaft.id);
  const stichtag = heute();
  const [gesellschafter, berichte, dokumente] = await Promise.all([
    db.gesellschafter.findMany({
      where: { mitgliedschaftId: m.id, gesellschaftId: { in: ids } },
      orderBy: [{ gesellschaft: { name: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        beteiligungProzent: true,
        gesellschaft: { select: { id: true, name: true } },
        bewegungen: { orderBy: [{ datum: "desc" }], select: { id: true, art: true, datum: true, betrag: true, quelle: true } },
        abrufe: {
          select: {
            id: true,
            betrag: true,
            abruf: { select: { bezeichnung: true, faelligAm: true } },
            eingaenge: { select: { datum: true, betrag: true } },
          },
        },
      },
    }),
    db.quartalsbericht.findMany({
      where: { status: "FREIGEGEBEN", gesellschaftId: { in: ids } },
      orderBy: [{ stichtag: "desc" }],
      select: { id: true, jahr: true, quartal: true, stichtag: true, freigegebenAm: true, gesellschaft: { select: { name: true } } },
    }),
    db.dokument.findMany({
      where: {
        investorFreigabeAm: { not: null },
        OR: [{ gesellschaftId: { in: ids } }, { kredit: { gesellschaftId: { in: ids } } }, { haus: { gesellschaftId: { in: ids } } }],
      },
      orderBy: [{ investorFreigabeAm: "desc" }],
      select: {
        id: true,
        titel: true,
        kategorie: true,
        jahr: true,
        dokumentDatum: true,
        investorFreigabeAm: true,
        gesellschaft: { select: { name: true } },
        haus: { select: { bezeichnung: true, gesellschaft: { select: { name: true } } } },
        kredit: { select: { bezeichnung: true, gesellschaft: { select: { name: true } } } },
      },
    }),
  ]);

  const konten: PortalKonto[] = gesellschafter.map((g) => {
    const bewegungen = g.bewegungen.map((b) => ({ id: b.id, art: b.art, datum: isoDatum(b.datum), betrag: dezimal(b.betrag), quelle: b.quelle }));
    return {
      id: g.id,
      name: g.name,
      gesellschaftId: g.gesellschaft.id,
      gesellschaft: g.gesellschaft.name,
      beteiligungProzent: g.beteiligungProzent === null ? null : dezimal(g.beteiligungProzent),
      summen: kontosummen(bewegungen),
      rendite: rendite(bewegungen, stichtag),
      bewegungen,
      abrufe: g.abrufe.map((p) => {
        const faelligAm = isoDatum(p.abruf.faelligAm)!;
        const betrag = dezimal(p.betrag);
        const eingaenge = p.eingaenge.map((e) => ({ datum: isoDatum(e.datum), betrag: dezimal(e.betrag) }));
        return { id: p.id, bezeichnung: p.abruf.bezeichnung, faelligAm, betrag, stand: positionStand(betrag, eingaenge, faelligAm, stichtag) };
      }),
    };
  });
  const mitKonto = new Set(konten.map((k) => k.gesellschaftId));
  return {
    mitgliedschaftId: m.id,
    investor: m.benutzer.name ?? m.benutzer.email,
    gesellschaften: m.gesellschaftZuweisungen.map((z) => ({ ...z.gesellschaft, mitKonto: mitKonto.has(z.gesellschaft.id) })).sort((a, b) => a.name.localeCompare(b.name, "de")),
    konten,
    berichte: berichte.map((b) => ({ id: b.id, jahr: b.jahr, quartal: b.quartal, stichtag: isoDatum(b.stichtag)!, gesellschaft: b.gesellschaft?.name ?? "", freigegebenAm: b.freigegebenAm })),
    dokumente: dokumente.map((d) => ({
      id: d.id,
      titel: d.titel,
      kategorie: d.kategorie,
      jahr: d.jahr,
      dokumentDatum: isoDatum(d.dokumentDatum),
      zuordnung: d.gesellschaft?.name ?? (d.haus ? `${d.haus.bezeichnung} · ${d.haus.gesellschaft.name}` : d.kredit ? `${d.kredit.bezeichnung} · ${d.kredit.gesellschaft.name}` : ""),
      freigegebenAm: d.investorFreigabeAm!,
    })),
  };
}

/** Ob ein Dokument im Portal dieser Mitgliedschaft sichtbar ist (für den Download). */
export async function portalDokument(kontext: Kontext, id: string, vorschauMitgliedschaftId?: string) {
  const mitgliedschaftId = kontext.rolle === "INVESTOR" ? kontext.mitgliedschaftId : vorschauMitgliedschaftId;
  if (!mitgliedschaftId) return null;
  const z = await kontext.db.gesellschaftZuweisung.findMany({ where: { mitgliedschaftId, mitgliedschaft: { rolle: "INVESTOR" } }, select: { gesellschaftId: true } });
  const ids = z.map((x) => x.gesellschaftId);
  return kontext.db.dokument.findFirst({
    where: { id, investorFreigabeAm: { not: null }, OR: [{ gesellschaftId: { in: ids } }, { kredit: { gesellschaftId: { in: ids } } }, { haus: { gesellschaftId: { in: ids } } }] },
    select: { speicherPfad: true, mimeType: true, dateiname: true },
  });
}
