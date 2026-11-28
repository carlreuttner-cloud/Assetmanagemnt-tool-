/**
 * Import von Mieterlisten (je Haus, z. B. von der Hausverwaltung).
 *
 * Ablauf: `leseMieterliste()` liest die CSV, `planeMieterImport()` vergleicht sie mit dem
 * Bestand des Hauses und beschreibt je Zeile, was beim Übernehmen passiert. Beide sind reine
 * Funktionen; geschrieben wird erst in der Server-Aktion, die den Plan neu berechnet.
 *
 * Regeln:
 * - Einheiten werden über ihre Bezeichnung gefunden (Groß-/Kleinschreibung und Leerzeichen egal).
 * - Gleicher Mieter wie im Bestand: geänderte Werte werden übernommen (sonst „unverändert“,
 *   dadurch ist ein erneuter Import derselben Liste harmlos).
 * - Anderer Mieter: Mieterwechsel. Das alte Mietverhältnis endet am Tag vor dem neuen Beginn.
 * - Kein Mieter (leer): ein laufendes Mietverhältnis endet am angegebenen Ende, sonst am Tag
 *   vor dem Stand der Liste.
 * - Leere Zellen ändern nichts, außer beim Rückstand (leer = 0).
 * - Einheiten, die in der Liste fehlen, bleiben unverändert und werden gemeldet.
 */
import { Decimal } from "../geld";
import { plusTage, type IsoDatum } from "../datum";
import { ueberschneiden } from "../mietverhaeltnis";
import { dekodiere, findeTabelle, leseCsv, leseDatum, leseZahl, normalisiere } from "./csv";
import type { Nutzungsart } from "../nutzungsart";

export type EinheitArtText = Nutzungsart;

export const MIETERLISTE_SPALTEN = {
  einheit: ["einheit", "einheitnr", "mieteinheit", "wohnung", "wohnungsnr", "whg", "whgnr", "nr", "nummer", "bezeichnung"],
  art: ["art", "nutzung", "nutzungsart", "typ"],
  flaeche: ["flaeche", "wohnflaeche", "nutzflaeche", "groesse"],
  mieter: ["mieter", "mietername", "mieterin", "name"],
  beginn: ["beginn", "mietbeginn", "vertragsbeginn", "einzug"],
  ende: ["ende", "mietende", "vertragsende", "auszug"],
  sollMiete: ["sollmiete", "nettokaltmiete", "kaltmiete", "nkm", "miete", "sollnettokaltmiete"],
  istMiete: ["istmiete", "istnettokaltmiete", "gezahlt", "zahlung", "zahlbetrag"],
  rueckstand: ["rueckstand", "mietrueckstand", "offen", "offenerbetrag"],
  letzteMieterhoehung: ["letztemieterhoehung", "mieterhoehung", "letzteerhoehung"],
  erwarteteMiete: ["erwartetemiete", "zielmiete", "marktmiete", "angebotsmiete"],
  nebenkosten: ["nebenkosten", "nk", "nkvorauszahlung", "nebenkostenvorauszahlung", "betriebskosten", "bkvorauszahlung", "vorauszahlung"],
} as const;

export type ListenFeld = keyof typeof MIETERLISTE_SPALTEN;

export interface ListenZeile {
  zeile: number;
  einheit: string;
  art: EinheitArtText | null;
  flaeche: Decimal | null;
  mieter: string | null;
  beginn: IsoDatum | null;
  ende: IsoDatum | null;
  sollMiete: Decimal | null;
  istMiete: Decimal | null;
  rueckstand: Decimal | null;
  letzteMieterhoehung: IsoDatum | null;
  erwarteteMiete: Decimal | null;
  /** Nebenkostenvorauszahlung je Monat (nur für die Stände der Mieterliste) */
  nebenkosten: Decimal | null;
  /** Spalte mit unlesbarem Wert, z. B. "sollMiete" */
  fehlerFeld: ListenFeld | null;
}

export interface Mieterliste {
  /** Vorhandene Spalten */
  spalten: ListenFeld[];
  zeilen: ListenZeile[];
  /** Grund, wenn keine Tabelle erkannt wurde */
  fehler: "kopfzeile" | null;
}

const LEER_MIETER = /^(leer|leerstand|frei|unvermietet|-+|–)$/i;

function leseArt(text: string): EinheitArtText | null {
  const s = normalisiere(text);
  if (!s) return null;
  if (/stellplatz|stellpl|garage|parkplatz|tiefgarage|carport|^tg|^sp$|parking/.test(s)) return "STELLPLATZ";
  if (/gewerb|laden|buero|praxis|gastro|commercial|retail|office/.test(s)) return "GEWERBE";
  if (/wohn|whg|apartment|residential/.test(s)) return "WOHNUNG";
  return null;
}

export function leseMieterliste(daten: Uint8Array | string): Mieterliste {
  const zeilen = leseCsv(typeof daten === "string" ? daten : dekodiere(daten));
  const kopf = findeTabelle(zeilen, MIETERLISTE_SPALTEN, (s) => s.einheit !== undefined && s.mieter !== undefined && s.sollMiete !== undefined);
  if (!kopf) return { spalten: [], zeilen: [], fehler: "kopfzeile" };
  const { index, spalten } = kopf;
  const roh = (z: string[], feld: ListenFeld) => (spalten[feld] !== undefined ? (z[spalten[feld]!] ?? "").trim() : "");

  const ergebnis: ListenZeile[] = [];
  zeilen.slice(index + 1).forEach((z, i) => {
    if (z.every((f) => f === "")) return;
    const einheit = roh(z, "einheit");
    if (!einheit) return;
    let fehlerFeld: ListenFeld | null = null;
    const zahl = (feld: ListenFeld) => {
      const text = roh(z, feld);
      if (!text) return null;
      const wert = leseZahl(text);
      if (!wert || wert.isNegative()) fehlerFeld ??= feld;
      return wert && !wert.isNegative() ? wert : null;
    };
    const datum = (feld: ListenFeld) => {
      const text = roh(z, feld);
      if (!text) return null;
      const wert = leseDatum(text);
      if (!wert) fehlerFeld ??= feld;
      return wert;
    };
    const artText = roh(z, "art");
    const art = leseArt(artText);
    if (artText && !art) fehlerFeld ??= "art";
    const mieter = roh(z, "mieter").replace(/\s+/g, " ");
    ergebnis.push({
      zeile: index + i + 2,
      einheit: einheit.replace(/\s+/g, " "),
      art,
      flaeche: zahl("flaeche"),
      mieter: mieter && !LEER_MIETER.test(mieter) ? mieter : null,
      beginn: datum("beginn"),
      ende: datum("ende"),
      sollMiete: zahl("sollMiete"),
      istMiete: zahl("istMiete"),
      rueckstand: zahl("rueckstand"),
      letzteMieterhoehung: datum("letzteMieterhoehung"),
      erwarteteMiete: zahl("erwarteteMiete"),
      nebenkosten: zahl("nebenkosten"),
      fehlerFeld,
    });
  });
  return { spalten: (Object.keys(spalten) as ListenFeld[]).sort(), zeilen: ergebnis, fehler: null };
}

// ---------------------------------------------------------------------------
// Abgleich mit dem Bestand

export interface BestandMietverhaeltnis {
  id: string;
  mieterId: string;
  mieterName: string;
  beginn: IsoDatum;
  ende: IsoDatum | null;
  sollMiete: Decimal;
  istMiete: Decimal;
  rueckstand: Decimal;
  rueckstandStichtag: IsoDatum | null;
  letzteMieterhoehung: IsoDatum | null;
}

export interface BestandEinheit {
  id: string;
  bezeichnung: string;
  art: EinheitArtText;
  flaeche: Decimal;
  erwarteteMiete: Decimal | null;
  mietverhaeltnisse: BestandMietverhaeltnis[];
}

/** Ein geändertes Feld; Beträge als Text mit zwei Nachkommastellen, Daten als JJJJ-MM-TT. */
export interface Aenderung {
  feld: "beginn" | "ende" | "sollMiete" | "istMiete" | "rueckstand" | "letzteMieterhoehung" | "erwarteteMiete" | "flaeche" | "art";
  alt: string | null;
  neu: string | null;
}

export interface NeuesMietverhaeltnis {
  mieterName: string;
  /** Vorhandener Mieter gleichen Namens in diesem Haus, sonst wird er angelegt */
  mieterId: string | null;
  beginn: IsoDatum;
  ende: IsoDatum | null;
  sollMiete: string;
  istMiete: string;
  rueckstand: string;
  letzteMieterhoehung: IsoDatum | null;
}

export type PlanAktion = "neu" | "aendern" | "mieterwechsel" | "auszug" | "unveraendert" | "fehler";

export type PlanFehler =
  | "einheitDoppelt"
  | "einheitUnbekannt"
  | "einheitDatenFehlen"
  | "wertUnlesbar"
  | "sollFehlt"
  | "beginnFehlt"
  | "beginnNachStand"
  | "wechselVorBeginn"
  | "endeVorBeginn"
  | "ueberschneidung";

export interface PlanZeile {
  zeile: number;
  einheit: string;
  mieter: string | null;
  aktion: PlanAktion;
  /** null: Einheit wird neu angelegt */
  einheitId: string | null;
  neueEinheit: { art: EinheitArtText; flaeche: string } | null;
  /** Änderungen an der Einheit (Fläche, Art, erwartete Miete) */
  einheitAenderungen: Aenderung[];
  /** Bestehendes Mietverhältnis, das beendet wird */
  beenden: { id: string; mieterName: string; ende: IsoDatum } | null;
  /** Bestehendes Mietverhältnis, das geändert wird */
  aktualisieren: { id: string; aenderungen: Aenderung[] } | null;
  anlegen: NeuesMietverhaeltnis | null;
  fehler: PlanFehler | null;
  /** Bei "wertUnlesbar": die betroffene Spalte */
  fehlerFeld: ListenFeld | null;
}

export interface MieterImportPlan {
  zeilen: PlanZeile[];
  /** Einheiten des Hauses, die in der Liste nicht vorkommen */
  fehlendeEinheiten: string[];
}

export interface PlanOptionen {
  /** Stand der Liste; Rückstände gelten zu diesem Tag */
  stand: IsoDatum;
  /** Darf Einheiten anlegen und Fläche/Art ändern (nicht die Hausverwaltung) */
  darfEinheitenPflegen: boolean;
}

const schluessel = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
const betrag = (d: Decimal | null) => (d ? d.toFixed(2) : null);

export function planeMieterImport(bestand: BestandEinheit[], liste: Mieterliste, o: PlanOptionen): MieterImportPlan {
  const einheiten = new Map(bestand.map((e) => [schluessel(e.bezeichnung), e]));
  const gesehen = new Set<string>();
  // Mieter dieses Hauses nach Namen, damit ein bekannter Mieter nicht doppelt angelegt wird
  const bekannteMieter = new Map<string, string>();
  for (const m of bestand.flatMap((e) => e.mietverhaeltnisse)) bekannteMieter.set(schluessel(m.mieterName), m.mieterId);

  const zeilen = liste.zeilen.map((z): PlanZeile => {
    const plan: PlanZeile = {
      zeile: z.zeile,
      einheit: z.einheit,
      mieter: z.mieter,
      aktion: "unveraendert",
      einheitId: null,
      neueEinheit: null,
      einheitAenderungen: [],
      beenden: null,
      aktualisieren: null,
      anlegen: null,
      fehler: null,
      fehlerFeld: null,
    };
    const fehler = (grund: PlanFehler): PlanZeile => ({
      ...plan,
      aktion: "fehler",
      fehler: grund,
      einheitAenderungen: [],
      beenden: null,
      aktualisieren: null,
      anlegen: null,
      neueEinheit: null,
    });

    const key = schluessel(z.einheit);
    if (gesehen.has(key)) return fehler("einheitDoppelt");
    gesehen.add(key);
    if (z.fehlerFeld) return { ...fehler("wertUnlesbar"), fehlerFeld: z.fehlerFeld };

    const einheit = einheiten.get(key);
    if (einheit) {
      plan.einheitId = einheit.id;
      if (o.darfEinheitenPflegen) {
        if (z.flaeche && !z.flaeche.equals(einheit.flaeche)) {
          plan.einheitAenderungen.push({ feld: "flaeche", alt: betrag(einheit.flaeche), neu: betrag(z.flaeche) });
        }
        if (z.art && z.art !== einheit.art) plan.einheitAenderungen.push({ feld: "art", alt: einheit.art, neu: z.art });
      }
    } else {
      if (!o.darfEinheitenPflegen) return fehler("einheitUnbekannt");
      if (!z.flaeche) return fehler("einheitDatenFehlen");
      plan.neueEinheit = { art: z.art ?? "WOHNUNG", flaeche: betrag(z.flaeche)! };
    }
    const vorhandene = einheit?.mietverhaeltnisse ?? [];
    // Mietverhältnisse, die zum Stand laufen oder erst beginnen
    const offene = vorhandene.filter((m) => m.ende === null || m.ende >= o.stand);
    const laufend = offene.find((m) => m.beginn <= o.stand) ?? null;

    if (!z.mieter) {
      if (z.erwarteteMiete && !(einheit?.erwarteteMiete && z.erwarteteMiete.equals(einheit.erwarteteMiete))) {
        plan.einheitAenderungen.push({ feld: "erwarteteMiete", alt: betrag(einheit?.erwarteteMiete ?? null), neu: betrag(z.erwarteteMiete) });
      }
      if (laufend) {
        const ende = z.ende && z.ende < o.stand ? z.ende : plusTage(o.stand, -1);
        if (ende < laufend.beginn) return fehler("endeVorBeginn");
        plan.beenden = { id: laufend.id, mieterName: laufend.mieterName, ende };
        plan.aktion = "auszug";
      }
      if (plan.aktion !== "auszug") {
        if (plan.neueEinheit) plan.aktion = "neu";
        else if (plan.einheitAenderungen.length > 0) plan.aktion = "aendern";
      }
      return plan;
    }

    if (!z.sollMiete && !offene.some((m) => schluessel(m.mieterName) === schluessel(z.mieter!))) return fehler("sollFehlt");
    const gleich = offene.find((m) => schluessel(m.mieterName) === schluessel(z.mieter!));

    if (gleich) {
      // Bekanntes Mietverhältnis: nur geänderte Werte übernehmen
      const a: Aenderung[] = [];
      const neuerBeginn = z.beginn ?? gleich.beginn;
      const neuesEnde = z.ende ?? gleich.ende;
      if (neuesEnde && neuesEnde < neuerBeginn) return fehler("endeVorBeginn");
      const andere = vorhandene.filter((m) => m.id !== gleich.id);
      if (andere.some((m) => ueberschneiden({ beginn: neuerBeginn, ende: neuesEnde }, m))) return fehler("ueberschneidung");
      if (z.beginn && z.beginn !== gleich.beginn) a.push({ feld: "beginn", alt: gleich.beginn, neu: z.beginn });
      if (z.ende && z.ende !== gleich.ende) a.push({ feld: "ende", alt: gleich.ende, neu: z.ende });
      if (z.sollMiete && !z.sollMiete.equals(gleich.sollMiete)) a.push({ feld: "sollMiete", alt: betrag(gleich.sollMiete), neu: betrag(z.sollMiete) });
      if (z.istMiete && !z.istMiete.equals(gleich.istMiete)) a.push({ feld: "istMiete", alt: betrag(gleich.istMiete), neu: betrag(z.istMiete) });
      if (liste.spalten.includes("rueckstand")) {
        const r = z.rueckstand ?? new Decimal(0);
        if (!r.equals(gleich.rueckstand) || (r.greaterThan(0) && gleich.rueckstandStichtag !== o.stand)) {
          a.push({ feld: "rueckstand", alt: betrag(gleich.rueckstand), neu: betrag(r) });
        }
      }
      if (z.letzteMieterhoehung && z.letzteMieterhoehung !== gleich.letzteMieterhoehung) {
        a.push({ feld: "letzteMieterhoehung", alt: gleich.letzteMieterhoehung, neu: z.letzteMieterhoehung });
      }
      if (a.length > 0) plan.aktualisieren = { id: gleich.id, aenderungen: a };
      if (a.length > 0 || plan.einheitAenderungen.length > 0) plan.aktion = "aendern";
      return plan;
    }

    // Neuer Mieter in dieser Einheit
    if (!z.beginn) return fehler("beginnFehlt");
    if (z.beginn > o.stand) return fehler("beginnNachStand");
    if (z.ende && z.ende < z.beginn) return fehler("endeVorBeginn");
    let ohne: string | null = null;
    if (laufend) {
      if (z.beginn <= laufend.beginn) return fehler("wechselVorBeginn");
      const ende = plusTage(z.beginn, -1);
      plan.beenden = { id: laufend.id, mieterName: laufend.mieterName, ende };
      ohne = laufend.id;
    }
    const andere = vorhandene
      .filter((m) => m.id !== ohne)
      .concat(laufend ? [{ ...laufend, ende: plan.beenden!.ende }] : []);
    if (andere.some((m) => ueberschneiden({ beginn: z.beginn!, ende: z.ende }, m))) return fehler("ueberschneidung");

    plan.anlegen = {
      mieterName: z.mieter,
      mieterId: bekannteMieter.get(schluessel(z.mieter)) ?? null,
      beginn: z.beginn,
      ende: z.ende,
      sollMiete: betrag(z.sollMiete)!,
      istMiete: betrag(z.istMiete ?? z.sollMiete)!,
      rueckstand: betrag(z.rueckstand ?? new Decimal(0))!,
      letzteMieterhoehung: z.letzteMieterhoehung,
    };
    plan.aktion = laufend ? "mieterwechsel" : "neu";
    return plan;
  });

  const fehlendeEinheiten = bestand.filter((e) => !gesehen.has(schluessel(e.bezeichnung))).map((e) => e.bezeichnung);
  return { zeilen, fehlendeEinheiten };
}

/** Kopfzeile der Vorlage und des Exports (deutsche Spaltennamen). */
export const VORLAGE_KOPF = [
  "Einheit",
  "Art",
  "Fläche (m²)",
  "Mieter",
  "Beginn",
  "Ende",
  "Soll-Miete (€/Monat)",
  "Ist-Miete (€/Monat)",
  "Rückstand (€)",
  "Letzte Mieterhöhung",
  "Erwartete Miete (€/Monat)",
] as const;

const deZahl = (d: Decimal | null) => (d ? d.toFixed(2).replace(".", ",") : "");
const deDatum = (d: IsoDatum | null) => (d ? `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}` : "");
const zelle = (text: string) => (/[;"\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text);

/**
 * Schreibt die aktuelle Mieterliste eines Hauses im Vorlagenformat (UTF-8 mit BOM, Semikolon),
 * damit die Hausverwaltung sie bearbeiten und wieder hochladen kann.
 */
export function schreibeMieterliste(einheiten: BestandEinheit[], stand: IsoDatum): string {
  const zeilen: string[][] = [[...VORLAGE_KOPF]];
  const sortiert = [...einheiten].sort((a, b) => a.bezeichnung.localeCompare(b.bezeichnung, "de", { numeric: true }));
  for (const e of sortiert) {
    const m = e.mietverhaeltnisse.find((x) => x.beginn <= stand && (x.ende === null || x.ende >= stand));
    zeilen.push([
      e.bezeichnung,
      e.art === "GEWERBE" ? "Gewerbe" : e.art === "STELLPLATZ" ? "Stellplatz" : "Wohnung",
      deZahl(e.flaeche),
      m?.mieterName ?? "",
      deDatum(m?.beginn ?? null),
      deDatum(m?.ende ?? null),
      deZahl(m?.sollMiete ?? null),
      deZahl(m?.istMiete ?? null),
      m ? deZahl(m.rueckstand) : "",
      deDatum(m?.letzteMieterhoehung ?? null),
      m ? "" : deZahl(e.erwarteteMiete),
    ]);
  }
  return "﻿" + zeilen.map((z) => z.map(zelle).join(";")).join("\r\n") + "\r\n";
}
