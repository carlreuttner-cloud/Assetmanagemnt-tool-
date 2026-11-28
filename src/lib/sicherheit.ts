/**
 * Sicherheiten-Register: aktive Sicherheiten am Stichtag und Deckung je Sicherungsverbund
 * (Kredite und Grundpfandrechte, die über gemeinsame Sicherheiten verbunden sind).
 * Freie Grundschuld nur aus belegter Restschuld; fehlende Werte bleiben unbekannt.
 */
import { dezimal, type Decimal } from "@/lib/geld";
import type { IsoDatum } from "@/lib/datum";
import type { RestschuldNachweis } from "@/lib/kredit";

export const SICHERHEIT_ARTEN = ["GRUNDSCHULD", "HYPOTHEK", "BUERGSCHAFT", "ABTRETUNG_MIETEN", "ABTRETUNG_SONSTIGE", "VERPFAENDUNG", "PATRONATSERKLAERUNG", "SONSTIGE"] as const;
export type SicherheitArt = (typeof SICHERHEIT_ARTEN)[number];
export const SICHERHEIT_QUELLEN = ["GRUNDBUCHAUSZUG", "SICHERUNGSVERTRAG", "BANKBESTAETIGUNG", "SONSTIGE"] as const;
export type SicherheitQuelle = (typeof SICHERHEIT_QUELLEN)[number];

export const istGrundpfandrecht = (art: SicherheitArt) => art === "GRUNDSCHULD" || art === "HYPOTHEK";

export interface SicherheitDaten {
  id: string;
  art: SicherheitArt;
  betrag: Decimal | null;
  eingetragenAm: IsoDatum | null;
  gueltigBis: IsoDatum | null;
  geloeschtAm: IsoDatum | null;
  hausIds: string[];
  kreditIds: string[];
}

/** Aktiv am Stichtag: eingetragen (oder ohne Datum), nicht gelöscht und nicht abgelaufen. */
export function istAktiv(s: Pick<SicherheitDaten, "eingetragenAm" | "gueltigBis" | "geloeschtAm">, stichtag: IsoDatum): boolean {
  if (s.eingetragenAm && s.eingetragenAm > stichtag) return false;
  if (s.geloeschtAm && s.geloeschtAm <= stichtag) return false;
  if (s.gueltigBis && s.gueltigBis < stichtag) return false;
  return true;
}

export interface Verbund {
  kreditIds: string[];
  sicherheitIds: string[];
  /** Summe der aktiven Grundpfandrechte; null, wenn ein Betrag fehlt */
  grundpfandrechte: Decimal | null;
  /** Summe der belegten Restschulden; null, wenn eine fehlt */
  restschuld: Decimal | null;
  /** Ältester und jüngster Stichtag der Restschulden */
  stichtage: { von: IsoDatum | null; bis: IsoDatum | null };
  /** Grundpfandrechte − Restschuld (Überdeckung); negativ = Unterdeckung; null = unbekannt */
  freieGrundschuld: Decimal | null;
  luecken: Array<"betrag" | "restschuld" | "keinGrundpfandrecht">;
}

/**
 * Bildet Sicherungsverbünde: Kredite, die sich (direkt oder über weitere Kredite) Grundpfandrechte
 * teilen, werden gemeinsam betrachtet, weil sich eine Gesamtgrundschuld nicht sinnvoll aufteilen lässt.
 */
export function sicherungsverbuende(
  sicherheiten: SicherheitDaten[],
  kredite: Array<{ id: string; restschuld: RestschuldNachweis | null }>,
  stichtag: IsoDatum,
): Verbund[] {
  const aktiv = sicherheiten.filter((s) => istAktiv(s, stichtag) && istGrundpfandrecht(s.art));
  const eltern = new Map<string, string>();
  const finde = (x: string): string => {
    let w = x;
    while (eltern.get(w) !== w) w = eltern.get(w)!;
    eltern.set(x, w);
    return w;
  };
  const vereine = (a: string, b: string) => eltern.set(finde(a), finde(b));
  for (const k of kredite) eltern.set(`k:${k.id}`, `k:${k.id}`);
  for (const s of aktiv) {
    eltern.set(`s:${s.id}`, `s:${s.id}`);
    for (const k of s.kreditIds) if (eltern.has(`k:${k}`)) vereine(`s:${s.id}`, `k:${k}`);
  }
  const gruppen = new Map<string, { kredite: string[]; sicherheiten: SicherheitDaten[] }>();
  for (const k of kredite) {
    const g = finde(`k:${k.id}`);
    if (!gruppen.has(g)) gruppen.set(g, { kredite: [], sicherheiten: [] });
    gruppen.get(g)!.kredite.push(k.id);
  }
  for (const s of aktiv) {
    const g = finde(`s:${s.id}`);
    if (!gruppen.has(g)) gruppen.set(g, { kredite: [], sicherheiten: [] });
    gruppen.get(g)!.sicherheiten.push(s);
  }
  const nachId = new Map(kredite.map((k) => [k.id, k]));
  return [...gruppen.values()].map((g) => {
    const luecken: Verbund["luecken"] = [];
    let gp: Decimal | null = dezimal(0);
    for (const s of g.sicherheiten) gp = s.betrag === null || gp === null ? null : gp.plus(s.betrag);
    if (g.sicherheiten.length === 0) {
      gp = null;
      luecken.push("keinGrundpfandrecht");
    } else if (gp === null) luecken.push("betrag");
    let rs: Decimal | null = dezimal(0);
    let von = null as IsoDatum | null;
    let bis = null as IsoDatum | null;
    for (const id of g.kredite) {
      const n = nachId.get(id)?.restschuld ?? null;
      if (!n) rs = null;
      else {
        if (rs !== null) rs = rs.plus(n.betrag);
        von = von === null || n.stichtag < von ? n.stichtag : von;
        bis = bis === null || n.stichtag > bis ? n.stichtag : bis;
      }
    }
    if (rs === null && g.kredite.length > 0) luecken.push("restschuld");
    if (g.kredite.length === 0) rs = null;
    return {
      kreditIds: g.kredite,
      sicherheitIds: g.sicherheiten.map((s) => s.id),
      grundpfandrechte: gp,
      restschuld: rs,
      stichtage: { von, bis },
      freieGrundschuld: gp !== null && rs !== null ? gp.minus(rs) : null,
      luecken,
    };
  });
}

/** Summe der aktiven Grundpfandrechte eines Hauses (Gesamtrechte voll je Haus); null bei fehlendem Betrag. */
export function belastungHaus(sicherheiten: SicherheitDaten[], hausId: string, stichtag: IsoDatum): { summe: Decimal | null; anzahl: number; gesamtrechte: number } {
  const s = sicherheiten.filter((x) => x.hausIds.includes(hausId) && istAktiv(x, stichtag) && istGrundpfandrecht(x.art));
  let summe: Decimal | null = dezimal(0);
  for (const x of s) summe = x.betrag === null || summe === null ? null : summe.plus(x.betrag);
  return { summe: s.length ? summe : null, anzahl: s.length, gesamtrechte: s.filter((x) => x.hausIds.length > 1).length };
}
