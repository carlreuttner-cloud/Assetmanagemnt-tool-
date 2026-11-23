/**
 * Szenario-Parameter aus Formularfeldern (GET-Parameter) lesen und als Kurztext beschreiben.
 * Ungültige Eingaben fallen auf den Basiswert zurück und werden gemeldet.
 */
import { fuelle, type Texte } from "@/i18n";
import { istIsoDatum } from "@/lib/datum";
import type { Formatierer } from "@/lib/format";
import { parseBetrag, type Decimal } from "@/lib/geld";
import { basisParameter, type SzenarioParameter } from "@/lib/szenario";

export const VERKAUF_ZEILEN = 3;

type Werte = Record<string, string | string[] | undefined>;

export function leseParameter(sp: Werte, sprache: string): { parameter: SzenarioParameter; fehler: string[]; vorhanden: boolean } {
  const b = basisParameter();
  const fehler: string[] = [];
  const eins = (name: string) => {
    const w = sp[name];
    return (Array.isArray(w) ? w[0] : w)?.trim() ?? "";
  };
  const liste = (name: string) => {
    const w = sp[name];
    return (Array.isArray(w) ? w : w === undefined ? [] : [w]).map((x) => x.trim());
  };
  const zahl = (text: string, name: string): Decimal | null => {
    if (!text) return null;
    try {
      return parseBetrag(text.replace("%", ""), sprache);
    } catch {
      fehler.push(name);
      return null;
    }
  };
  const ganz = (text: string, name: string, min: number, max: number): number | null => {
    if (!text) return null;
    const n = Number(text);
    if (!Number.isInteger(n) || n < min || n > max) {
      fehler.push(name);
      return null;
    }
    return n;
  };

  const vorhanden = Object.keys(sp).some((k) => ["jahre", "zins", "anschluss", "miete", "ausfall", "leer", "wert", "v_haus"].includes(k));
  const verkaeufe: SzenarioParameter["verkaeufe"] = [];
  const haeuser = liste("v_haus");
  const daten = liste("v_datum");
  const preise = liste("v_preis");
  haeuser.forEach((hausId, i) => {
    if (!hausId) return;
    const datum = daten[i] ?? "";
    if (!istIsoDatum(datum)) {
      fehler.push("v_datum");
      return;
    }
    verkaeufe.push({ hausId, datum, preis: zahl(preise[i] ?? "", "v_preis") });
  });

  return {
    vorhanden,
    fehler,
    parameter: {
      jahre: ganz(eins("jahre"), "jahre", 1, 10) ?? b.jahre,
      zinsVariabelPP: zahl(eins("zins"), "zins") ?? b.zinsVariabelPP,
      anschlusszins: zahl(eins("anschluss"), "anschluss"),
      mietsteigerung: zahl(eins("miete"), "miete") ?? b.mietsteigerung,
      mietausfall: zahl(eins("ausfall"), "ausfall") ?? b.mietausfall,
      leerVermietenMonate: ganz(eins("leer"), "leer", 0, 120),
      wertentwicklung: zahl(eins("wert"), "wert") ?? b.wertentwicklung,
      verkaeufe,
      verkaufskosten: zahl(eins("kosten"), "kosten") ?? b.verkaufskosten,
      vorfaelligkeit: zahl(eins("vfe"), "vfe") ?? b.vorfaelligkeit,
    },
  };
}

/** Kurzbeschreibung der vom Basisfall abweichenden Annahmen, z. B. für die Liste. */
export function kurzText(p: SzenarioParameter, t: Texte, f: Formatierer): string {
  const k = t.szenarien.kurz;
  const teile: string[] = [];
  const pp = (d: Decimal) => (d.isPositive() && !d.isZero() ? "+" : "") + f.eingabe(d);
  if (!p.zinsVariabelPP.isZero()) teile.push(fuelle(k.zins, { wert: pp(p.zinsVariabelPP) }));
  if (p.anschlusszins) teile.push(fuelle(k.anschluss, { wert: f.prozent(p.anschlusszins, 2) }));
  if (!p.mietsteigerung.isZero()) teile.push(fuelle(k.miete, { wert: f.prozent(p.mietsteigerung, 1) }));
  if (!p.mietausfall.isZero()) teile.push(fuelle(k.ausfall, { wert: f.prozent(p.mietausfall, 1) }));
  if (p.leerVermietenMonate !== null) teile.push(fuelle(k.leer, { monate: p.leerVermietenMonate }));
  if (!p.wertentwicklung.isZero()) teile.push(fuelle(k.wert, { wert: f.prozent(p.wertentwicklung, 1) }));
  if (p.verkaeufe.length > 0) teile.push(fuelle(k.verkauf, { anzahl: p.verkaeufe.length }));
  return teile.length > 0 ? teile.join(" · ") : k.basis;
}
