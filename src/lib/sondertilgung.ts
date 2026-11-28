/**
 * Sondertilgungsrechte: je Jahr (Kalender- oder Vertragsjahr) erlaubt, genutzt und noch offen.
 * Genutzt = Summe der Buchungen der Art Sondertilgung im Zeitraum (Quelle: Kreditbuchungen).
 * Ist das Recht nicht erfasst, bleibt alles unbekannt; es wird nichts angenommen. Reine Funktionen.
 */
import { plusMonate, type IsoDatum } from "./datum";
import { dezimal, type Decimal } from "./geld";
import type { BuchungDaten } from "./kredit";

export type SondertilgungRechtArt = "UNBEKANNT" | "KEINES" | "PROZENT" | "BETRAG";
export type SondertilgungJahrArt = "KALENDERJAHR" | "VERTRAGSJAHR";

export interface SondertilgungEingabe {
  recht: SondertilgungRechtArt;
  wert: Decimal | null;
  jahr: SondertilgungJahrArt;
  uebertragbar: boolean;
  /** Recht gilt bis; null = Ende der Zinsbindung, sonst der Laufzeit, sonst offen */
  bis: IsoDatum | null;
  ursprungsbetrag: Decimal;
  auszahlungsdatum: IsoDatum | null;
  zinsbindungBis: IsoDatum | null;
  laufzeitBis: IsoDatum | null;
  buchungen: Pick<BuchungDaten, "datum" | "art" | "betrag">[];
}

export interface SondertilgungJahr {
  von: IsoDatum;
  bis: IsoDatum;
  /** Recht dieses Jahres */
  erlaubt: Decimal;
  /** aus dem Vorjahr übertragen (nur wenn übertragbar) */
  uebertrag: Decimal;
  genutzt: Decimal;
  buchungen: number;
  /** erlaubt + Übertrag − genutzt, mindestens 0 */
  offen: Decimal;
  /** genutzt über dem Recht */
  ueberschritten: Decimal;
  laufend: boolean;
}

export type SondertilgungErgebnis =
  | { art: "unbekannt"; grund: "recht" | "wert" | "auszahlung"; genutzt: Decimal }
  | { art: "keines"; genutzt: Decimal }
  | { art: "recht"; jahresrecht: Decimal; gueltigBis: IsoDatum | null; jahre: SondertilgungJahr[] };

const NULL = dezimal(0);
const tagDavor = (d: IsoDatum): IsoDatum => new Date(Date.parse(`${d}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/** Ende des Rechts: eigene Angabe, sonst Zinsbindung, sonst Laufzeit. */
export const rechtGiltBis = (e: Pick<SondertilgungEingabe, "bis" | "zinsbindungBis" | "laufzeitBis">): IsoDatum | null => e.bis ?? e.zinsbindungBis ?? e.laufzeitBis;

/** Betrag des Rechts je Jahr. */
export function jahresrecht(e: Pick<SondertilgungEingabe, "recht" | "wert" | "ursprungsbetrag">): Decimal | null {
  if (e.wert === null) return null;
  if (e.recht === "PROZENT") return e.ursprungsbetrag.times(e.wert).dividedBy(100);
  if (e.recht === "BETRAG") return e.wert;
  return null;
}

/** Zeiträume vom Auszahlungstag bis zum Stichtag bzw. bis zum Ende des Rechts (das frühere). */
export function zeitraeume(start: IsoDatum, jahr: SondertilgungJahrArt, ende: IsoDatum): Array<{ von: IsoDatum; bis: IsoDatum }> {
  const liste: Array<{ von: IsoDatum; bis: IsoDatum }> = [];
  let von = start;
  for (let n = 1; von <= ende && n < 200; n++) {
    const regulaer = jahr === "KALENDERJAHR" ? `${von.slice(0, 4)}-12-31` : tagDavor(plusMonate(start, 12 * n));
    liste.push({ von, bis: regulaer });
    von = jahr === "KALENDERJAHR" ? `${Number(von.slice(0, 4)) + 1}-01-01` : plusMonate(start, 12 * n);
  }
  return liste;
}

export function sondertilgung(e: SondertilgungEingabe, stichtag: IsoDatum): SondertilgungErgebnis {
  const st = e.buchungen.filter((b) => b.art === "SONDERTILGUNG");
  const summe = (liste: typeof st) => liste.reduce((s, b) => s.plus(b.betrag.abs()), NULL);
  if (e.recht === "UNBEKANNT") return { art: "unbekannt", grund: "recht", genutzt: summe(st) };
  if (e.recht === "KEINES") return { art: "keines", genutzt: summe(st) };
  const recht = jahresrecht(e);
  if (recht === null) return { art: "unbekannt", grund: "wert", genutzt: summe(st) };
  if (!e.auszahlungsdatum) return { art: "unbekannt", grund: "auszahlung", genutzt: summe(st) };
  const gueltigBis = rechtGiltBis(e);
  const ende = gueltigBis && gueltigBis < stichtag ? gueltigBis : stichtag;
  const jahre: SondertilgungJahr[] = [];
  let uebertrag = NULL;
  for (const z of zeitraeume(e.auszahlungsdatum, e.jahr, ende)) {
    const bis = gueltigBis && gueltigBis < z.bis ? gueltigBis : z.bis;
    const imJahr = st.filter((b) => b.datum >= z.von && b.datum <= bis);
    const genutzt = summe(imJahr);
    const verfuegbar = recht.plus(uebertrag);
    const offen = verfuegbar.minus(genutzt);
    jahre.push({
      von: z.von,
      bis,
      erlaubt: recht,
      uebertrag,
      genutzt,
      buchungen: imJahr.length,
      offen: offen.isNegative() ? NULL : offen,
      ueberschritten: offen.isNegative() ? offen.negated() : NULL,
      laufend: z.von <= stichtag && stichtag <= bis,
    });
    uebertrag = e.uebertragbar && offen.greaterThan(0) ? offen : NULL;
  }
  return { art: "recht", jahresrecht: recht, gueltigBis, jahre };
}

/** Laufendes Jahr, falls das Recht am Stichtag gilt. */
export function laufendesJahr(erg: SondertilgungErgebnis): SondertilgungJahr | null {
  return erg.art === "recht" ? (erg.jahre.find((j) => j.laufend) ?? null) : null;
}

const fuelle = (text: string, werte: Record<string, string>) => text.replace(/\{(\w+)\}/g, (_, k: string) => werte[k] ?? "");

/** Recht als Text, z. B. „5 % von 1.000.000 € = 50.000 € je Kalenderjahr“. */
export function sondertilgungRegel(
  e: Pick<SondertilgungEingabe, "recht" | "wert" | "ursprungsbetrag" | "jahr">,
  ts: { regel: string; regelProzent: string; jahre: Record<SondertilgungJahrArt, string>; rechte: Record<SondertilgungRechtArt, string> },
  f: { betragGanz: (w: Decimal) => string; prozent: (w: Decimal, stellen?: number) => string },
): string {
  const betrag = jahresrecht(e);
  if (betrag === null) return ts.rechte[e.recht];
  const jahr = ts.jahre[e.jahr];
  return e.recht === "PROZENT"
    ? fuelle(ts.regelProzent, { prozent: f.prozent(e.wert!, e.wert!.isInteger() ? 0 : 2), basis: f.betragGanz(e.ursprungsbetrag), betrag: f.betragGanz(betrag), jahr })
    : fuelle(ts.regel, { betrag: f.betragGanz(betrag), jahr });
}
