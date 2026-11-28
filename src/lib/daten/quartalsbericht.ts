import "server-only";
import type { Kontext } from "@/lib/auth/kontext";
import { isoDatum } from "@/lib/datum";
import { dezimal } from "@/lib/geld";
import { erstelleQuartalsbericht, type Quartal, type QuartalsberichtInhalt } from "@/lib/quartalsbericht";
import { ladeRechengrundlage } from "./portfolio";

/** Rechnet den Bericht für das Portfolio (gesellschaftId null) oder eine sichtbare Gesellschaft. */
export async function baueQuartalsbericht(kontext: Kontext, gesellschaftId: string | null, jahr: number, quartal: Quartal, texte: { portfolio: string }): Promise<QuartalsberichtInhalt | null> {
  const grundlage = await ladeRechengrundlage(kontext, gesellschaftId ? { gesellschaftId } : {});
  const gesellschaftIds = [...new Set([...grundlage.haeuser.map((h) => h.gesellschaftId), ...grundlage.kredite.map((k) => k.gesellschaftId)])];
  if (gesellschaftId && !gesellschaftIds.includes(gesellschaftId)) {
    const sichtbar = grundlage.sicht.gesellschaftIds === "alle" || grundlage.sicht.gesellschaftIds.includes(gesellschaftId);
    if (!sichtbar) return null;
    gesellschaftIds.push(gesellschaftId);
  }
  const [gesellschaften, haeuser, kredite, covenants, kontostaende] = await Promise.all([
    kontext.db.gesellschaft.findMany({ where: { id: { in: gesellschaftIds } }, select: { id: true, name: true } }),
    kontext.db.haus.findMany({ where: { id: { in: grundlage.haeuser.map((h) => h.id) } }, select: { id: true, bezeichnung: true } }),
    kontext.db.kredit.findMany({ where: { id: { in: grundlage.kredite.map((k) => k.id) } }, select: { id: true, bezeichnung: true, bank: true } }),
    kontext.db.covenant.findMany({ where: { kreditId: { in: grundlage.kredite.map((k) => k.id) } }, orderBy: [{ folge: "asc" }, { kennzahl: "asc" }], select: { kreditId: true, kennzahl: true, folge: true, vergleich: true, schwellenwert: true } }),
    kontext.db.bankkontostand.findMany({ where: { gesellschaftId: { in: gesellschaftIds } }, select: { id: true, gesellschaftId: true, konto: true, stichtag: true, betrag: true, quelle: true } }),
  ]);
  const name = gesellschaftId ? gesellschaften.find((g) => g.id === gesellschaftId)?.name : texte.portfolio;
  if (!name) return null;
  return erstelleQuartalsbericht({
    umfang: { art: gesellschaftId ? "gesellschaft" : "portfolio", name },
    mandant: kontext.mandant.name,
    jahr,
    quartal,
    erstelltAm: new Date(),
    erstelltVon: kontext.benutzer.name,
    haeuser: grundlage.haeuser,
    kredite: grundlage.kredite,
    referenzwerte: grundlage.referenzwerte,
    namen: {
      haus: new Map(haeuser.map((h) => [h.id, h.bezeichnung])),
      kredit: new Map(kredite.map((k) => [k.id, { name: k.bezeichnung, bank: k.bank }])),
      gesellschaft: new Map(gesellschaften.map((g) => [g.id, g.name])),
    },
    covenants: covenants.map((c) => ({ ...c, schwellenwert: c.schwellenwert === null ? null : dezimal(c.schwellenwert) })),
    kontostaende: kontostaende.map((k) => ({ id: k.id, gesellschaftId: k.gesellschaftId, konto: k.konto, stichtag: isoDatum(k.stichtag), betrag: dezimal(k.betrag), quelle: k.quelle })),
    gesellschaftIds: gesellschaften.map((g) => g.id),
  });
}

/**
 * Welche Berichte eine Person sehen darf: Eingeschränkte Rollen (Investor) nur freigegebene Berichte
 * ihrer Gesellschaften, nie Portfolio-Berichte (sie enthalten fremde Gesellschaften).
 */
export function berichtFilter(rolle: Kontext["rolle"], gesellschaftIds: string[] | "alle") {
  if (rolle === "ADMIN" || rolle === "MITARBEITER") return {};
  return { status: "FREIGEGEBEN" as const, gesellschaftId: { in: gesellschaftIds === "alle" ? undefined : gesellschaftIds, not: null } };
}
