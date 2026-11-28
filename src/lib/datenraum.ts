/**
 * Datenraum: ordnet die Unterlagen eines Hauses oder einer Gesellschaft in eine feste Ordnerstruktur
 * und erstellt das Inhaltsverzeichnis. Pfade im Archiv ohne Umlaute und Sonderzeichen, damit sie auch
 * mit dem in Windows eingebauten Entpacken lesbar bleiben; die Originalnamen stehen im Verzeichnis.
 * Reine Funktionen.
 */
import type { IsoDatum } from "./datum";

export type PaketArt = "gesellschaft" | "haus";

export interface DatenraumDokument {
  id: string;
  titel: string;
  kategorie: string | null;
  jahr: number | null;
  dokumentDatum: IsoDatum | null;
  dateiname: string;
  mimeType: string;
  groesseBytes: number;
  pruefsumme: string | null;
  bestaetigt: boolean;
  absender: string | null;
  /** Zuordnung; gesetzt ist, was am Dokument hinterlegt ist */
  gesellschaft: string | null;
  haus: string | null;
  einheit: string | null;
  mieter: string | null;
  kredit: string | null;
}

export interface Ordnernamen {
  gesellschaft: string;
  haeuser: string;
  haus: string;
  kredite: string;
  mietverhaeltnisse: string;
  ohneKategorie: string;
}

const ERSETZE: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", Ä: "Ae", Ö: "Oe", Ü: "Ue", ß: "ss", "–": "-", "—": "-", "&": "und" };

/** Sicherer Name für einen Ordner oder eine Datei (ohne Endung). */
export function sichererName(text: string, max = 80): string {
  const s = text
    .replace(/[äöüÄÖÜß–—&]/g, (z) => ERSETZE[z])
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ._()+,-]/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s-]+|[.\s-]+$/g, "");
  return (s || "-").slice(0, max).trim();
}

function endung(d: Pick<DatenraumDokument, "dateiname" | "mimeType">): string {
  const aus = d.dateiname.match(/\.([A-Za-z0-9]{1,5})$/)?.[1]?.toLowerCase();
  if (aus) return aus;
  return ({ "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as Record<string, string>)[d.mimeType] ?? "bin";
}

/** Ordner im Archiv: Mietverhältnis/Einheit vor Kredit vor Haus vor Gesellschaft. */
export function ordner(d: DatenraumDokument, art: PaketArt, n: Ordnernamen): string[] {
  const kat = sichererName(d.kategorie ?? n.ohneKategorie);
  const mv = d.einheit ? sichererName([d.einheit, d.mieter].filter(Boolean).join(" - ")) : null;
  if (art === "haus") {
    if (mv) return [`2 ${n.mietverhaeltnisse}`, mv];
    if (d.kredit) return [`3 ${n.kredite}`, sichererName(d.kredit), kat];
    return [`1 ${n.haus}`, kat];
  }
  if (mv) return [`3 ${n.haeuser}`, sichererName(d.haus ?? "-"), n.mietverhaeltnisse, mv];
  if (d.kredit) return [`2 ${n.kredite}`, sichererName(d.kredit), kat];
  if (d.haus) return [`3 ${n.haeuser}`, sichererName(d.haus), kat];
  return [`1 ${n.gesellschaft}`, kat];
}

/** Dateiname: Datum (oder Jahr) und Titel, damit die Dateien im Ordner zeitlich sortiert sind. */
export function dateiName(d: DatenraumDokument): string {
  const vorne = d.dokumentDatum ?? (d.jahr ? String(d.jahr) : null);
  return `${sichererName([vorne, d.titel].filter(Boolean).join(" "), 120)}.${endung(d)}`;
}

export interface DatenraumEintrag {
  nr: number;
  pfad: string;
  dokument: DatenraumDokument;
}

/** Pfade für alle Dokumente, sortiert; gleiche Namen bekommen „(2)“, „(3)“ … angehängt. */
export function ordneDokumente(dokumente: DatenraumDokument[], art: PaketArt, n: Ordnernamen, wurzel: string): DatenraumEintrag[] {
  const mitPfad = dokumente.map((d) => ({ d, pfad: [sichererName(wurzel), ...ordner(d, art, n), dateiName(d)].join("/") }));
  mitPfad.sort((a, b) => a.pfad.localeCompare(b.pfad, "de") || a.d.id.localeCompare(b.d.id));
  const vergeben = new Set<string>();
  return mitPfad.map(({ d, pfad }, i) => {
    let p = pfad;
    for (let k = 2; vergeben.has(p.toLowerCase()); k++) p = pfad.replace(/(\.[a-z0-9]+)$/, ` (${k})$1`);
    vergeben.add(p.toLowerCase());
    return { nr: i + 1, pfad: p, dokument: d };
  });
}

/** CSV mit Semikolon und BOM, damit Excel Umlaute und Spalten richtig liest. */
export function csv(zeilen: Array<Array<string | number | null>>): string {
  const zelle = (w: string | number | null) => {
    const s = w === null ? "" : String(w);
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + zeilen.map((z) => z.map(zelle).join(";")).join("\r\n") + "\r\n";
}
