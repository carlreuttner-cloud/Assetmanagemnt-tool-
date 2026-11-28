/**
 * Alte Leerstandslisten: eine Datei mit Leerständen mehrerer Häuser und Stichtage.
 *
 * Haus und Stichtag stehen entweder als Spalte in jeder Zeile oder als Zwischenzeile
 * („Objekt: Alsterblick 27“, „Stand 31.03.2026“), die für die folgenden Zeilen gilt. Die Zuordnung
 * zu Häusern und Einheiten erfolgt nach festen Regeln; was so nicht eindeutig ist, bleibt offen
 * (und kann als KI-Vorschlag zur Bestätigung angeboten werden).
 */
import type { Decimal } from "../geld";
import { monatsende, type IsoDatum } from "../datum";
import type { Nutzungsart } from "../nutzungsart";
import { findeTabelle, leseCsv, leseDatum, leseZahl, normalisiere } from "./csv";

export const LEERSTAND_SPALTEN = {
  haus: ["haus", "objekt", "objektbezeichnung", "liegenschaft", "immobilie", "gebaeude", "adresse", "anschrift", "objektadresse"],
  einheit: ["einheit", "einheitnr", "mieteinheit", "wohnung", "wohnungsnr", "whg", "whgnr", "nr", "nummer", "bezeichnung", "leerstand", "leerstehendeeinheit"],
  stichtag: ["stichtag", "stand", "datum", "monat", "standper", "per", "berichtsmonat"],
  art: ["art", "nutzung", "nutzungsart", "typ"],
  flaeche: ["flaeche", "wohnflaeche", "nutzflaeche", "groesse", "qm"],
  leerSeit: ["leerseit", "leerstandseit", "freiseit", "seit", "leerab", "freiab"],
  erwarteteMiete: ["erwartetemiete", "zielmiete", "marktmiete", "angebotsmiete", "sollmiete", "nettokaltmiete", "kaltmiete", "nkm", "miete"],
  notiz: ["bemerkung", "notiz", "kommentar", "hinweis", "grund", "status"],
} as const;
export type LeerstandFeld = keyof typeof LEERSTAND_SPALTEN;

export interface LeerstandZeile {
  zeile: number;
  hausText: string | null;
  einheit: string;
  stichtag: IsoDatum | null;
  art: Nutzungsart | null;
  flaeche: Decimal | null;
  leerSeit: IsoDatum | null;
  erwarteteMiete: Decimal | null;
  notiz: string | null;
}

export interface Leerstandsliste {
  spalten: LeerstandFeld[];
  zeilen: LeerstandZeile[];
  fehler: "kopfzeile" | null;
}

const MONATE = ["januar", "februar", "maerz", "april", "mai", "juni", "juli", "august", "september", "oktober", "november", "dezember"];

/** Stichtag aus Datum oder Monat („03/2026“, „2026-03“, „März 2026“ → Monatsende). */
export function leseStichtag(text: string): IsoDatum | null {
  const s = text.trim();
  const datum = leseDatum(s) ?? (/(\d{1,2}\.\d{1,2}\.\d{2,4})/.exec(s)?.[1] ? leseDatum(/(\d{1,2}\.\d{1,2}\.\d{2,4})/.exec(s)![1]) : null);
  if (datum) return datum;
  let m = /(?:^|\D)(\d{1,2})[./](\d{4})(?:\D|$)/.exec(s);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return monatsende(Number(m[2]) * 12 + Number(m[1]) - 1);
  m = /(?:^|\D)(\d{4})-(\d{2})(?:\D|$)/.exec(s);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return monatsende(Number(m[1]) * 12 + Number(m[2]) - 1);
  const n = normalisiere(s);
  const monat = MONATE.findIndex((x) => n.includes(x));
  const jahr = /(\d{4})/.exec(s)?.[1];
  if (monat >= 0 && jahr) return monatsende(Number(jahr) * 12 + monat);
  return null;
}

function leseArt(text: string): Nutzungsart | null {
  const s = normalisiere(text);
  if (!s) return null;
  if (/stellplatz|stellpl|garage|parkplatz|tiefgarage|carport|^tg|^sp$|parking/.test(s)) return "STELLPLATZ";
  if (/gewerb|laden|buero|praxis|gastro|commercial|retail|office/.test(s)) return "GEWERBE";
  if (/wohn|whg|apartment|residential/.test(s)) return "WOHNUNG";
  return null;
}

const HAUS_ZEILE = /^(objekt|haus|liegenschaft|immobilie|gebaeude|adresse)\s*[:\-–]?\s*/i;

export function leseLeerstandsliste(text: string): Leerstandsliste {
  const roh = leseCsv(text);
  const kopf = findeTabelle(roh, LEERSTAND_SPALTEN, (s) => s.einheit !== undefined);
  if (!kopf) return { spalten: [], zeilen: [], fehler: "kopfzeile" };
  const { index, spalten } = kopf;
  const wert = (z: string[], feld: LeerstandFeld) => (spalten[feld] !== undefined ? (z[spalten[feld]!] ?? "").trim() : "");

  // Zwischenzeilen vor der Kopfzeile (z. B. „Stand 31.03.2026“) gelten ebenfalls
  let hausText: string | null = null;
  let stichtag: IsoDatum | null = null;
  const zwischen = (z: string[], frei = false) => {
    const gefuellt = z.filter((f) => f !== "");
    if (gefuellt.length === 0 || gefuellt.length > 2) return false;
    const text = gefuellt.join(" ");
    const tag = /stand|stichtag|per|monat|datum/i.test(text) || gefuellt.length === 1 ? leseStichtag(text) : null;
    if (tag) {
      stichtag = tag;
      const rest = text.replace(/(stand|stichtag|per|monat|datum)\s*(vom|zum|per)?\s*[:\-–]?\s*/i, "").replace(/\d{1,2}\.\d{1,2}\.\d{2,4}|\d{1,2}\/\d{4}|\d{4}-\d{2}/, "").trim();
      if (HAUS_ZEILE.test(rest)) hausText = rest.replace(HAUS_ZEILE, "").trim() || hausText;
      return true;
    }
    // Hausname nur mit Kennwort („Objekt: …“) oder als einziger Wert einer Zeile ohne Einheit
    if (HAUS_ZEILE.test(text) || (frei && gefuellt.length === 1)) {
      hausText = text.replace(HAUS_ZEILE, "").trim();
      return true;
    }
    return false;
  };
  for (const z of roh.slice(0, index)) zwischen(z);

  const zeilen: LeerstandZeile[] = [];
  roh.slice(index + 1).forEach((z, i) => {
    if (z.every((f) => f === "")) return;
    const einheit = wert(z, "einheit");
    // Zwischenzeile für Haus oder Stichtag (steht oft in der ersten Spalte); Einheiten wie „WE 3“ nie
    const wenige = z.filter((f) => f !== "").length <= 2;
    const wieEinheit = /^(we|sp|ge)\d/.test(einheitSchluessel(einheit));
    if (!einheit || (wenige && !wieEinheit && (HAUS_ZEILE.test(einheit) || /stand|stichtag/i.test(einheit)) && zwischen(z))) {
      if (!einheit) zwischen(z, true);
      return;
    }
    if (/^(summe|gesamt|total)\b/i.test(einheit)) return;
    const tag = wert(z, "stichtag");
    zeilen.push({
      zeile: index + i + 2,
      hausText: wert(z, "haus") || hausText,
      einheit: einheit.replace(/\s+/g, " "),
      stichtag: tag ? leseStichtag(tag) : stichtag,
      art: leseArt(wert(z, "art")),
      flaeche: wert(z, "flaeche") ? leseZahl(wert(z, "flaeche")) : null,
      leerSeit: wert(z, "leerSeit") ? leseDatum(wert(z, "leerSeit")) : null,
      erwarteteMiete: wert(z, "erwarteteMiete") ? leseZahl(wert(z, "erwarteteMiete")) : null,
      notiz: wert(z, "notiz") || null,
    });
  });
  return { spalten: (Object.keys(spalten) as LeerstandFeld[]).sort(), zeilen, fehler: null };
}

// ---------------------------------------------------------------------------
// Zuordnung

/** Vergleichsschlüssel für Hausnamen: „Alsterblick 27, 20099 Hamburg“ → „alsterblick27“ (+ Ort). */
export function hausSchluessel(text: string): string {
  return normalisiere(text.replace(/str\.(?=\s|\d|$)/gi, "strasse").replace(/\bstr\b/gi, "strasse"));
}

/** Haus aus dem Text: genau gleich, sonst das längste Haus (Bezeichnung oder Straße), das im Text vorkommt. */
export function findeHaus(text: string | null, haeuser: Array<{ id: string; bezeichnung: string; strasse: string | null }>): string | null {
  if (!text) return null;
  const s = hausSchluessel(text);
  if (!s) return null;
  const genau = haeuser.filter((h) => hausSchluessel(h.bezeichnung) === s || (h.strasse && hausSchluessel(h.strasse) === s));
  if (genau.length === 1) return genau[0].id;
  const treffer = haeuser
    .flatMap((h) => [h.bezeichnung, h.strasse].filter((x): x is string => !!x).map((n) => ({ id: h.id, n: hausSchluessel(n) })))
    .filter((x) => x.n.length >= 5 && s.includes(x.n))
    .sort((a, b) => b.n.length - a.n.length);
  if (treffer.length === 0) return null;
  // eindeutig: das längste Stück gehört nur zu einem Haus
  const laengste = treffer.filter((x) => x.n.length === treffer[0].n.length);
  return new Set(laengste.map((x) => x.id)).size === 1 ? laengste[0].id : null;
}

/** Vergleichsschlüssel für Einheiten: „Whg. 03“, „WE 3“, „Wohnung 3“ → „we3“; „TG-Platz 4“ → „sp4“. */
export function einheitSchluessel(text: string): string {
  let s = normalisiere(text);
  s = s
    .replace(/^(wohnung|whg|wohneinheit|we)/, "we")
    .replace(/^(stellplatz|tgplatz|tiefgaragenplatz|tiefgarage|garage|stpl|tg|sp|pkw)/, "sp")
    .replace(/^(gewerbeeinheit|gewerbe|laden|ge|gew)/, "ge");
  return s.replace(/(\D)0+(\d)/g, "$1$2").replace(/^0+(\d)/, "$1");
}

export function findeEinheit(text: string, einheiten: Array<{ id: string; bezeichnung: string }>): string | null {
  const s = einheitSchluessel(text);
  const treffer = einheiten.filter((e) => einheitSchluessel(e.bezeichnung) === s);
  return treffer.length === 1 ? treffer[0].id : null;
}

export type ZeilenStatus = "zugeordnet" | "ki" | "hausUnbekannt" | "einheitUnbekannt" | "ohneStichtag" | "doppelt";

export interface PlanLeerZeile extends LeerstandZeile {
  hausId: string | null;
  einheitId: string | null;
  status: ZeilenStatus;
}

export interface Zuordnungen {
  /** hausText → hausId (Auswahl in der Vorschau oder KI-Vorschlag) */
  haeuser: Record<string, string>;
  /** `${hausId}|${einheitText}` → einheitId (KI-Vorschlag) */
  einheiten: Record<string, string>;
  /** Herkunft KI je Schlüssel, damit die Vorschau sie kennzeichnet */
  ki?: string[];
}

export interface HausKandidat {
  id: string;
  bezeichnung: string;
  strasse: string | null;
  einheiten: Array<{ id: string; bezeichnung: string }>;
}

export function planeLeerstandImport(liste: Leerstandsliste, haeuser: HausKandidat[], z: Zuordnungen = { haeuser: {}, einheiten: {} }): PlanLeerZeile[] {
  const nachId = new Map(haeuser.map((h) => [h.id, h]));
  const gesehen = new Set<string>();
  const ki = new Set(z.ki ?? []);
  return liste.zeilen.map((r): PlanLeerZeile => {
    const gewaehlt = r.hausText ? z.haeuser[r.hausText] : undefined;
    const hausId = gewaehlt && nachId.has(gewaehlt) ? gewaehlt : findeHaus(r.hausText, haeuser);
    if (!hausId) return { ...r, hausId: null, einheitId: null, status: "hausUnbekannt" };
    if (!r.stichtag) return { ...r, hausId, einheitId: null, status: "ohneStichtag" };
    const h = nachId.get(hausId)!;
    const kiSchluessel = `${hausId}|${r.einheit}`;
    const vorschlag = z.einheiten[kiSchluessel];
    const einheitId = findeEinheit(r.einheit, h.einheiten) ?? (vorschlag && h.einheiten.some((e) => e.id === vorschlag) ? vorschlag : null);
    if (!einheitId) return { ...r, hausId, einheitId: null, status: "einheitUnbekannt" };
    const doppelt = `${einheitId}|${r.stichtag}`;
    if (gesehen.has(doppelt)) return { ...r, hausId, einheitId, status: "doppelt" };
    gesehen.add(doppelt);
    const ausKi = (vorschlag === einheitId && !findeEinheit(r.einheit, h.einheiten)) || (gewaehlt === hausId && ki.has(r.hausText!));
    return { ...r, hausId, einheitId, status: ausKi ? "ki" : "zugeordnet" };
  });
}

/** Gruppen Haus × Stichtag der übernehmbaren Zeilen. */
export function gruppiere(plan: PlanLeerZeile[]) {
  const gruppen = new Map<string, { hausId: string; stichtag: IsoDatum; zeilen: PlanLeerZeile[] }>();
  for (const z of plan) {
    if ((z.status !== "zugeordnet" && z.status !== "ki") || !z.hausId || !z.stichtag) continue;
    const k = `${z.hausId}|${z.stichtag}`;
    const g = gruppen.get(k) ?? { hausId: z.hausId, stichtag: z.stichtag, zeilen: [] };
    g.zeilen.push(z);
    gruppen.set(k, g);
  }
  return [...gruppen.values()].sort((a, b) => a.hausId.localeCompare(b.hausId) || a.stichtag.localeCompare(b.stichtag));
}

/** Antwortformat der KI: nur Zuordnungen auf vorhandene IDs, keine Werte. */
export const LEERSTAND_KI_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["haeuser", "einheiten"],
  properties: {
    haeuser: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["text", "hausId"], properties: { text: { type: "string" }, hausId: { type: ["string", "null"] } } },
    },
    einheiten: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["hausId", "text", "einheitId"],
        properties: { hausId: { type: "string" }, text: { type: "string" }, einheitId: { type: ["string", "null"] } },
      },
    },
  },
};

/** Prüft die KI-Antwort: nur IDs, die es gibt und die zum Haus gehören. */
export function pruefeKiZuordnung(json: unknown, offen: { haeuser: string[]; einheiten: Array<{ hausId: string; text: string }> }, haeuser: HausKandidat[]): Zuordnungen {
  const r = json as { haeuser?: unknown; einheiten?: unknown };
  if (!Array.isArray(r.haeuser) || !Array.isArray(r.einheiten)) throw new Error("Format");
  const nachId = new Map(haeuser.map((h) => [h.id, h]));
  const ergebnis: Zuordnungen = { haeuser: {}, einheiten: {}, ki: [] };
  for (const x of r.haeuser as Array<{ text?: unknown; hausId?: unknown }>) {
    if (typeof x.text === "string" && typeof x.hausId === "string" && offen.haeuser.includes(x.text) && nachId.has(x.hausId)) {
      ergebnis.haeuser[x.text] = x.hausId;
      ergebnis.ki!.push(x.text);
    }
  }
  for (const x of r.einheiten as Array<{ hausId?: unknown; text?: unknown; einheitId?: unknown }>) {
    if (typeof x.hausId !== "string" || typeof x.text !== "string" || typeof x.einheitId !== "string") continue;
    if (!offen.einheiten.some((o) => o.hausId === x.hausId && o.text === x.text)) continue;
    if (!nachId.get(x.hausId)?.einheiten.some((e) => e.id === x.einheitId)) continue;
    ergebnis.einheiten[`${x.hausId}|${x.text}`] = x.einheitId;
  }
  return ergebnis;
}
