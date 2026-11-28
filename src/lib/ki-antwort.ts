/**
 * Generative Antworten des KI-Assistenten (reine Funktionen, ohne Datenbank und ohne KI).
 *
 * Ablauf:
 *  1. Die KI wählt zur Frage Datenabfragen aus einem festen Katalog (Art + Objekt-Kürzel).
 *  2. Der Code führt die Abfragen aus (`src/lib/daten/ki-fragen.ts`): jede Zahl mit Quelle,
 *     Stichtag und Berechnung, fehlende Werte als „unbekannt“.
 *  3. Die KI sieht die Ergebnisse und wählt Bausteine (Text, Kacheln, Tabelle, Diagramme,
 *     Regler). Die Schemata enthalten kein einziges Zahlenfeld: Zahlen erscheinen in Texten nur
 *     als Platzhalter {A1.feld}, die der Code ersetzt. Zahlen, die die KI trotzdem frei
 *     schreibt, werden entfernt und gekennzeichnet.
 *  4. Der Code prüft jeden Baustein gegen die Ergebnisse; ungültige Bausteine entfallen mit
 *     Hinweis.
 */
import { fuelle, type Texte } from "@/i18n";
import type { IsoDatum } from "./datum";
import type { Formatierer } from "./format";
import { dezimal } from "./geld";
import { NUTZUNGSARTEN, type Nutzungsart } from "./nutzungsart";

export const KI_FRAGE_MAX = 500;
export const MAX_ABFRAGEN = 6;
export const MAX_BAUSTEINE = 12;

// ---------------------------------------------------------------------------
// Katalog: Datenabfragen und Felder
// ---------------------------------------------------------------------------

export const ABFRAGE_ARTEN = ["KENNZAHLEN", "GESELLSCHAFTEN", "HAEUSER", "KREDITE", "VERLAUF"] as const;
export type AbfrageArt = (typeof ABFRAGE_ARTEN)[number];

/** Welche Objekte eine Abfrage annimmt: ALLE, Gesellschaft (G…), Haus (H…). */
export const ABFRAGE_OBJEKTE: Record<AbfrageArt, Array<"ALLE" | "G" | "H">> = {
  KENNZAHLEN: ["ALLE", "G", "H"],
  GESELLSCHAFTEN: ["ALLE"],
  HAEUSER: ["ALLE", "G"],
  KREDITE: ["ALLE", "G"],
  VERLAUF: ["ALLE", "G", "H"],
};

export type WertArt = "betrag" | "betragM2" | "prozent" | "faktor" | "flaeche" | "anzahl" | "datum" | "text";

export const FELDER = {
  sollJahr: "betrag",
  istJahr: "betrag",
  leerstandQuote: "prozent",
  flaeche: "flaeche",
  einheiten: "anzahl",
  leereEinheiten: "anzahl",
  verkehrswert: "betrag",
  restschuld: "betrag",
  ltv: "prozent",
  dscr: "faktor",
  icr: "faktor",
  kapitaldienstJahr: "betrag",
  rueckstand: "betrag",
  sollProM2: "betragM2",
  bank: "text",
  zinsbindungBis: "datum",
  zinssatz: "prozent",
} as const satisfies Record<string, WertArt>;
export type Feld = keyof typeof FELDER;

export const KENNZAHL_FELDER: Feld[] = ["sollJahr", "istJahr", "leerstandQuote", "flaeche", "einheiten", "leereEinheiten", "verkehrswert", "restschuld", "ltv", "dscr", "icr", "kapitaldienstJahr", "rueckstand", "sollProM2"];
export const KREDIT_FELDER: Feld[] = ["bank", "zinsbindungBis", "zinssatz", "restschuld", "kapitaldienstJahr"];
export const VERLAUF_FELDER: Feld[] = ["verkehrswert", "restschuld", "sollJahr"];

export const ABFRAGE_FELDER: Record<AbfrageArt, Feld[]> = {
  KENNZAHLEN: KENNZAHL_FELDER,
  GESELLSCHAFTEN: KENNZAHL_FELDER,
  HAEUSER: KENNZAHL_FELDER,
  KREDITE: KREDIT_FELDER,
  VERLAUF: VERLAUF_FELDER,
};

/** Abkürzungen der Felder für das Glossar in der Ansicht. */
export const FELD_BEGRIFFE: Partial<Record<Feld, "JNKM" | "LTV" | "DSCR" | "ICR" | "Restschuld" | "Kapitaldienst" | "Leerstand" | "Zinsbindung">> = {
  sollJahr: "JNKM",
  istJahr: "JNKM",
  ltv: "LTV",
  dscr: "DSCR",
  icr: "ICR",
  restschuld: "Restschuld",
  kapitaldienstJahr: "Kapitaldienst",
  leerstandQuote: "Leerstand",
  zinsbindungBis: "Zinsbindung",
};

// ---------------------------------------------------------------------------
// Ergebnisse der Abfragen (gespeichert als JSON, Werte als Text)
// ---------------------------------------------------------------------------

/** Ein Wert: `w` als Dezimaltext, Datum oder Text; null = unbekannt. */
export type Wert = { w: string | null; unvollstaendig?: boolean; stichtag?: IsoDatum | null; hinweis?: string };

export type ArtWerte = { einheiten: number; leereEinheiten: number; flaeche: string; leerFlaeche: string };

export interface Zeile {
  code: string;
  name: string;
  href: string;
  werte: Partial<Record<Feld, Wert>>;
}

interface ErgebnisBasis {
  id: string;
  art: AbfrageArt;
  objekt: string;
  /** Anzeigename des Objekts, z. B. „Alle sichtbaren Gesellschaften“ */
  objektName: string;
  stichtag: IsoDatum;
  felder: Feld[];
}

export type AbfrageErgebnis =
  | (ErgebnisBasis & { typ: "werte"; werte: Partial<Record<Feld, Wert>>; nachArt: Record<Nutzungsart, ArtWerte> })
  | (ErgebnisBasis & { typ: "tabelle"; zeilen: Zeile[] })
  | (ErgebnisBasis & { typ: "reihe"; punkte: Array<{ x: IsoDatum; werte: Partial<Record<Feld, Wert>> }> });

/** Objekt-Kürzel, die die KI verwenden darf (nur sichtbare Objekte). */
export interface Objekte {
  gesellschaften: Array<{ code: string; id: string; name: string }>;
  haeuser: Array<{ code: string; id: string; name: string; gesellschaft: string }>;
}

export interface FrageDaten {
  objekte: Objekte;
  ergebnisse: AbfrageErgebnis[];
}

// ---------------------------------------------------------------------------
// Schritt 1: Plan (Datenabfragen)
// ---------------------------------------------------------------------------

export type PlanEintrag = { art: AbfrageArt; objekt: string };

export const PLAN_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["abfragen"],
  properties: {
    abfragen: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["art", "objekt"],
        properties: { art: { type: "string", enum: [...ABFRAGE_ARTEN] }, objekt: { type: "string" } },
      },
    },
  },
};

/** Prüft den Plan: bekannte Art, erlaubtes Objekt-Kürzel, keine Doppelungen, höchstens 6. */
export function pruefePlan(json: unknown, objekte: Objekte): PlanEintrag[] {
  const roh = (json as { abfragen?: unknown })?.abfragen;
  if (!Array.isArray(roh)) throw new Error("Format");
  const g = new Set(objekte.gesellschaften.map((x) => x.code));
  const h = new Set(objekte.haeuser.map((x) => x.code));
  const gesehen = new Set<string>();
  const plan: PlanEintrag[] = [];
  for (const e of roh as Array<{ art?: unknown; objekt?: unknown }>) {
    const art = e?.art as AbfrageArt;
    const objekt = typeof e?.objekt === "string" ? e.objekt.trim().toUpperCase() : "";
    if (!ABFRAGE_ARTEN.includes(art)) continue;
    const erlaubt = ABFRAGE_OBJEKTE[art];
    const ok = (objekt === "ALLE" && erlaubt.includes("ALLE")) || (g.has(objekt) && erlaubt.includes("G")) || (h.has(objekt) && erlaubt.includes("H"));
    const schluessel = `${art}:${objekt}`;
    if (!ok || gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    plan.push({ art, objekt });
    if (plan.length >= MAX_ABFRAGEN) break;
  }
  if (plan.length === 0) plan.push({ art: "KENNZAHLEN", objekt: "ALLE" });
  return plan;
}

// ---------------------------------------------------------------------------
// Schritt 2: Bausteine
// ---------------------------------------------------------------------------

export const BAUSTEIN_TYPEN = ["TEXT", "KACHELN", "KREIS", "TABELLE", "SAEULEN", "LINIE", "REGLER"] as const;
export type BausteinTyp = (typeof BAUSTEIN_TYPEN)[number];

export const REGLER_ARTEN = ["mietsteigerung", "mietausfall", "zinsVariabelPP", "anschlusszins"] as const;
export type ReglerArt = (typeof REGLER_ARTEN)[number];

export const ZEILEN_AUSWAHL = ["alle", "top5", "top10"] as const;

export type Baustein =
  | { typ: "TEXT"; titel: string | null; text: string }
  | { typ: "KACHELN"; titel: string; abfrage: string; felder: Feld[] }
  | { typ: "KREIS"; titel: string; abfrage: string }
  | { typ: "TABELLE"; titel: string; abfrage: string; felder: Feld[]; sortierFeld: Feld | null; absteigend: boolean; zeilen: (typeof ZEILEN_AUSWAHL)[number] }
  | { typ: "SAEULEN"; titel: string; abfrage: string; feld: Feld; absteigend: boolean; zeilen: (typeof ZEILEN_AUSWAHL)[number] }
  | { typ: "LINIE"; titel: string; abfrage: string; felder: Feld[] }
  | { typ: "REGLER"; titel: string; objekt: string; regler: ReglerArt[] };

/** Ein Baustein nach der Prüfung, mit Hinweisen (z. B. entfernte Zahlen im Text). */
export type GeprueftBaustein = Baustein & { hinweise: string[] };

export interface GepruefteAntwort {
  bausteine: GeprueftBaustein[];
  /** Hinweise zu verworfenen Bausteinen */
  verworfen: string[];
}

const nullbar = (schema: object) => ({ anyOf: [schema, { type: "null" }] });

export const ANTWORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["bausteine"],
  properties: {
    bausteine: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["typ", "titel", "text", "abfrage", "felder", "sortierFeld", "absteigend", "zeilen", "objekt", "regler"],
        properties: {
          typ: { type: "string", enum: [...BAUSTEIN_TYPEN] },
          titel: nullbar({ type: "string" }),
          text: nullbar({ type: "string" }),
          abfrage: nullbar({ type: "string" }),
          felder: { type: "array", items: { type: "string", enum: Object.keys(FELDER) } },
          sortierFeld: nullbar({ type: "string", enum: Object.keys(FELDER) }),
          absteigend: { type: "boolean" },
          zeilen: { type: "string", enum: [...ZEILEN_AUSWAHL] },
          objekt: nullbar({ type: "string" }),
          regler: { type: "array", items: { type: "string", enum: [...REGLER_ARTEN] } },
        },
      },
    },
  },
};

/** Texte für Prüfhinweise (aus `t.kiFragen.pruefung`). */
export type PruefTexte = Texte["kiFragen"]["pruefung"];

const ZAHL = /\d+(?:[.,]\d+)*/g;
const PLATZHALTER = /\{([A-Z]\d+)\.(?:([GHK]\d{2,3})\.)?([a-zA-Z]+)\}/g;

/**
 * Entfernt Zahlen, die die KI frei in einen Text geschrieben hat. Erlaubt sind Jahreszahlen
 * (1990–2099), Objekt-Kürzel (G01, H12) und Platzhalter; alles andere wird durch „[?]“
 * ersetzt. Liefert den bereinigten Text und die Anzahl entfernter Zahlen.
 */
export function entferneFreieZahlen(text: string): { text: string; entfernt: number } {
  let entfernt = 0;
  const teile = text.split(/(\{[^}]*\})/g);
  const ergebnis = teile.map((teil) => {
    if (/^\{[A-Z]\d+\.[^}]*\}$/.test(teil)) return teil;
    return teil.replace(ZAHL, (zahl, pos: number, ganz: string) => {
      const davor = ganz.slice(Math.max(0, pos - 1), pos);
      if (/^[GHKA]$/.test(davor)) return zahl; // Kürzel wie H03 oder A1
      if (/^(19|20)\d\d$/.test(zahl)) return zahl;
      entfernt++;
      return "[?]";
    });
  });
  return { text: ergebnis.join(""), entfernt };
}

/** Teile eines Textes: freier Text oder ein Platzhalter mit seinem Wert. */
export type TextTeil = { text: string } | { abfrage: string; zeile: string | null; feld: Feld };

/** Zerlegt einen Text in freie Teile und gültige Platzhalter; ungültige werden zu „[?]“. */
export function zerlegeText(text: string, daten: FrageDaten): { teile: TextTeil[]; ungueltig: number } {
  const teile: TextTeil[] = [];
  let ungueltig = 0;
  let letzte = 0;
  for (const m of text.matchAll(PLATZHALTER)) {
    const [ganz, abfrage, zeile, feld] = m;
    if (m.index! > letzte) teile.push({ text: text.slice(letzte, m.index) });
    letzte = m.index! + ganz.length;
    if (wertZu(daten, abfrage, zeile ?? null, feld as Feld) === undefined) {
      ungueltig++;
      teile.push({ text: "[?]" });
    } else {
      teile.push({ abfrage, zeile: zeile ?? null, feld: feld as Feld });
    }
  }
  if (letzte < text.length) teile.push({ text: text.slice(letzte) });
  return { teile, ungueltig };
}

/** Wert eines Platzhalters; undefined, wenn es Abfrage, Zeile oder Feld nicht gibt. */
export function wertZu(daten: FrageDaten, abfrage: string, zeile: string | null, feld: Feld): Wert | undefined {
  const e = daten.ergebnisse.find((x) => x.id === abfrage);
  if (!e || !(feld in FELDER) || !e.felder.includes(feld)) return undefined;
  if (e.typ === "werte") return zeile ? undefined : e.werte[feld] ?? { w: null };
  if (e.typ === "tabelle") {
    if (!zeile) return undefined;
    const z = e.zeilen.find((x) => x.code === zeile);
    return z ? z.werte[feld] ?? { w: null } : undefined;
  }
  return undefined;
}

const text = (wert: unknown, max = 2000) => (typeof wert === "string" ? wert.trim().slice(0, max) : "");

/**
 * Prüft die Bausteine der KI gegen die Ergebnisse: Abfrage vorhanden und vom passenden Typ,
 * Felder vorhanden, Regler-Objekt erlaubt. Texte und Titel werden von freien Zahlen bereinigt.
 */
export function pruefeAntwort(json: unknown, daten: FrageDaten, t: PruefTexte): GepruefteAntwort {
  const roh = (json as { bausteine?: unknown })?.bausteine;
  if (!Array.isArray(roh)) throw new Error("Format");
  const bausteine: GeprueftBaustein[] = [];
  const verworfen: string[] = [];
  const regelObjekte = new Set(["ALLE", ...daten.objekte.gesellschaften.map((g) => g.code), ...daten.objekte.haeuser.map((h) => h.code)]);

  for (const [i, b] of (roh as Array<Record<string, unknown>>).entries()) {
    if (bausteine.length >= MAX_BAUSTEINE) break;
    const nr = i + 1;
    const typ = b?.typ as BausteinTyp;
    if (!BAUSTEIN_TYPEN.includes(typ)) {
      verworfen.push(fuelle(t.unbekannterTyp, { nr }));
      continue;
    }
    const hinweise: string[] = [];
    const titelRoh = text(b.titel, 200);
    const titelBereinigt = entferneFreieZahlen(titelRoh);
    if (titelBereinigt.entfernt) hinweise.push(t.zahlEntfernt);
    const titel = titelBereinigt.text;

    if (typ === "TEXT") {
      const bereinigt = entferneFreieZahlen(text(b.text));
      if (!bereinigt.text) continue;
      const { ungueltig } = zerlegeText(bereinigt.text, daten);
      if (bereinigt.entfernt) hinweise.push(t.zahlEntfernt);
      if (ungueltig) hinweise.push(t.platzhalterUngueltig);
      bausteine.push({ typ, titel: titel || null, text: bereinigt.text, hinweise });
      continue;
    }
    if (typ === "REGLER") {
      const objekt = text(b.objekt, 10).toUpperCase() || "ALLE";
      const regler = (Array.isArray(b.regler) ? b.regler : []).filter((r): r is ReglerArt => REGLER_ARTEN.includes(r as ReglerArt));
      if (!regelObjekte.has(objekt) || regler.length === 0) {
        verworfen.push(fuelle(t.reglerUngueltig, { nr }));
        continue;
      }
      bausteine.push({ typ, titel, objekt, regler: [...new Set(regler)], hinweise });
      continue;
    }

    const abfrage = text(b.abfrage, 10).toUpperCase();
    const e = daten.ergebnisse.find((x) => x.id === abfrage);
    if (!e) {
      verworfen.push(fuelle(t.abfrageFehlt, { nr, abfrage: abfrage || "–" }));
      continue;
    }
    const passend: Record<Exclude<BausteinTyp, "TEXT" | "REGLER">, AbfrageErgebnis["typ"]> = { KACHELN: "werte", KREIS: "werte", TABELLE: "tabelle", SAEULEN: "tabelle", LINIE: "reihe" };
    if (passend[typ] !== e.typ) {
      verworfen.push(fuelle(t.typPasstNicht, { nr, abfrage }));
      continue;
    }
    const felder = [...new Set((Array.isArray(b.felder) ? b.felder : []).filter((f): f is Feld => typeof f === "string" && e.felder.includes(f as Feld)))];
    const zeilen = ZEILEN_AUSWAHL.includes(b.zeilen as never) ? (b.zeilen as (typeof ZEILEN_AUSWAHL)[number]) : "alle";
    const absteigend = b.absteigend !== false;
    const sortierFeld = typeof b.sortierFeld === "string" && e.felder.includes(b.sortierFeld as Feld) ? (b.sortierFeld as Feld) : null;

    if (typ === "KREIS") {
      bausteine.push({ typ, titel, abfrage, hinweise });
      continue;
    }
    if (felder.length === 0) {
      verworfen.push(fuelle(t.keineFelder, { nr, abfrage }));
      continue;
    }
    if (typ === "KACHELN") bausteine.push({ typ, titel, abfrage, felder: felder.slice(0, 8), hinweise });
    else if (typ === "TABELLE") bausteine.push({ typ, titel, abfrage, felder: felder.slice(0, 10), sortierFeld, absteigend, zeilen, hinweise });
    else if (typ === "SAEULEN") {
      const feld = felder.find((f) => FELDER[f] !== "text" && FELDER[f] !== "datum");
      if (!feld) {
        verworfen.push(fuelle(t.keineFelder, { nr, abfrage }));
        continue;
      }
      bausteine.push({ typ, titel, abfrage, feld, absteigend, zeilen, hinweise });
    } else {
      bausteine.push({ typ: "LINIE", titel, abfrage, felder: felder.filter((f) => FELDER[f] !== "text" && FELDER[f] !== "datum"), hinweise });
    }
  }
  if (bausteine.length === 0) throw new Error("Format");
  return { bausteine, verworfen };
}

// ---------------------------------------------------------------------------
// Sortieren, Formatieren
// ---------------------------------------------------------------------------

/** Sortiert Zeilen nach einem Feld; unbekannte Werte immer ans Ende (nie als 0). */
export function sortiereZeilen(zeilen: Zeile[], feld: Feld | null, absteigend: boolean, auswahl: (typeof ZEILEN_AUSWAHL)[number]): Zeile[] {
  let liste = [...zeilen];
  if (feld) {
    const art = FELDER[feld];
    liste.sort((a, b) => {
      const x = a.werte[feld]?.w ?? null;
      const y = b.werte[feld]?.w ?? null;
      if (x === null || y === null) return x === y ? 0 : x === null ? 1 : -1;
      const v = art === "text" || art === "datum" ? x.localeCompare(y) : dezimal(x).comparedTo(dezimal(y));
      return absteigend ? -v : v;
    });
  }
  if (auswahl === "top5") liste = liste.slice(0, 5);
  if (auswahl === "top10") liste = liste.slice(0, 10);
  return liste;
}

/** Formatierter Wert oder null (unbekannt). */
export function formatWert(feld: Feld, wert: Wert | undefined, f: Formatierer): string | null {
  if (!wert || wert.w === null) return null;
  switch (FELDER[feld]) {
    case "betrag":
      return f.betragGanz(wert.w);
    case "betragM2":
      return `${f.betrag(wert.w)}/m²`;
    case "prozent":
      return f.prozent(wert.w, feld === "zinssatz" ? 3 : 1);
    case "faktor":
      return f.faktor(wert.w);
    case "flaeche":
      return `${f.zahl(wert.w, 0)} m²`;
    case "anzahl":
      return f.zahl(wert.w, 0);
    case "datum":
      return f.datum(wert.w);
    default:
      return wert.w;
  }
}

/** Leere Aufteilung nach Nutzungsart. */
export function leereArtWerte(): Record<Nutzungsart, ArtWerte> {
  return Object.fromEntries(NUTZUNGSARTEN.map((a) => [a, { einheiten: 0, leereEinheiten: 0, flaeche: "0", leerFlaeche: "0" }])) as Record<Nutzungsart, ArtWerte>;
}

// ---------------------------------------------------------------------------
// Nachrichten an die KI
// ---------------------------------------------------------------------------

/** Katalog für Schritt 1: Abfragen und sichtbare Objekte mit Kürzeln. */
export function katalogAlsText(frage: string, stichtag: IsoDatum, objekte: Objekte, t: Texte): string {
  const tk = t.kiFragen;
  const zeilen = [
    `${tk.ki.stichtag}: ${stichtag}`,
    "",
    `# ${tk.ki.abfragen}`,
    ...ABFRAGE_ARTEN.map((a) => `- ${a} (${tk.ki.objekte}: ${ABFRAGE_OBJEKTE[a].join(", ")}): ${tk.abfragen[a].beschreibung}`),
    "",
    `# ${tk.ki.gesellschaften}`,
    ...objekte.gesellschaften.map((g) => `- ${g.code}: ${g.name}`),
    "",
    `# ${tk.ki.haeuser}`,
    ...objekte.haeuser.map((h) => `- ${h.code}: ${h.name} (${h.gesellschaft})`),
    "",
    `# ${tk.ki.frage}`,
    frage,
  ];
  return zeilen.join("\n");
}

/** Ergebnisse für Schritt 2: je Abfrage Felder und Werte (formatiert, mit Stichtag). */
export function ergebnisseAlsText(frage: string, daten: FrageDaten, t: Texte, f: Formatierer): string {
  const tk = t.kiFragen;
  const fmt = (feld: Feld, w: Wert | undefined) => {
    const s = formatWert(feld, w, f) ?? t.allgemein.unbekannt;
    const zusatz = [w?.unvollstaendig ? t.allgemein.unvollstaendig : null, w?.stichtag ? `${tk.ki.stand} ${w.stichtag}` : null].filter(Boolean).join(", ");
    return zusatz ? `${s} (${zusatz})` : s;
  };
  const zeilen: string[] = [];
  for (const e of daten.ergebnisse) {
    zeilen.push(`# ${e.id}: ${e.art} ${e.objekt} – ${e.objektName} (${tk.ki.stichtag} ${e.stichtag}, ${tk.ki.typ} ${e.typ})`);
    zeilen.push(`${tk.ki.felder}: ${e.felder.map((x) => `${x} = ${tk.felder[x].name}`).join("; ")}`);
    if (e.typ === "werte") {
      for (const x of e.felder) zeilen.push(`- ${x}: ${fmt(x, e.werte[x])}`);
      zeilen.push(`- ${tk.ki.nachArt}: ${NUTZUNGSARTEN.filter((a) => e.nachArt[a].einheiten > 0).map((a) => `${t.nutzungsarten[a]} ${e.nachArt[a].leereEinheiten}/${e.nachArt[a].einheiten} ${tk.ki.leer}`).join(", ") || "–"}`);
    } else if (e.typ === "tabelle") {
      for (const z of e.zeilen) zeilen.push(`- ${z.code} ${z.name}: ${e.felder.map((x) => `${x} ${fmt(x, z.werte[x])}`).join("; ")}`);
      if (e.zeilen.length === 0) zeilen.push(`- ${tk.ki.keineZeilen}`);
    } else {
      for (const p of e.punkte) zeilen.push(`- ${p.x}: ${e.felder.map((x) => `${x} ${fmt(x, p.werte[x])}`).join("; ")}`);
    }
    zeilen.push("");
  }
  zeilen.push(`# ${tk.ki.reglerObjekte}`, ["ALLE", ...daten.objekte.gesellschaften.map((g) => g.code), ...daten.objekte.haeuser.map((h) => h.code)].join(", "), "");
  zeilen.push(`# ${tk.ki.frage}`, frage);
  return zeilen.join("\n");
}

// ---------------------------------------------------------------------------
// Demo ohne KI (Entwicklung ohne API-Schlüssel)
// ---------------------------------------------------------------------------

/** Plan nach Stichworten, damit die Ansicht ohne KI ausprobiert werden kann. */
export function demoPlan(frage: string): PlanEintrag[] {
  const plan: PlanEintrag[] = [{ art: "KENNZAHLEN", objekt: "ALLE" }, { art: "GESELLSCHAFTEN", objekt: "ALLE" }];
  if (/kredit|zins|finanz|bank|restschuld/i.test(frage)) plan.push({ art: "KREDITE", objekt: "ALLE" });
  if (/haus|häuser|objekt|leerstand/i.test(frage)) plan.push({ art: "HAEUSER", objekt: "ALLE" });
  plan.push({ art: "VERLAUF", objekt: "ALLE" });
  return plan;
}

/** Beispielantwort aus den Ergebnissen des Demo-Plans (feste Auswahl, keine KI). */
export function demoAntwort(daten: FrageDaten, t: PruefTexte & { demoText: string; demoTitel: Record<string, string> }): GepruefteAntwort {
  const id = (art: AbfrageArt) => daten.ergebnisse.find((e) => e.art === art)?.id;
  const k = id("KENNZAHLEN");
  const g = id("GESELLSCHAFTEN");
  const h = id("HAEUSER");
  const kr = id("KREDITE");
  const v = id("VERLAUF");
  const roh: Array<Record<string, unknown>> = [];
  const leer = { titel: null, text: null, abfrage: null, felder: [], sortierFeld: null, absteigend: true, zeilen: "alle", objekt: null, regler: [] };
  if (k) {
    roh.push({ ...leer, typ: "TEXT", text: fuelle(t.demoText, { a: k }) });
    roh.push({ ...leer, typ: "KACHELN", titel: t.demoTitel.kacheln, abfrage: k, felder: ["sollJahr", "leerstandQuote", "restschuld", "ltv", "dscr"] });
    roh.push({ ...leer, typ: "KREIS", titel: t.demoTitel.kreis, abfrage: k });
  }
  if (g) {
    roh.push({ ...leer, typ: "SAEULEN", titel: t.demoTitel.saeulen, abfrage: g, felder: ["leerstandQuote"], zeilen: "top10" });
    roh.push({ ...leer, typ: "TABELLE", titel: t.demoTitel.tabelle, abfrage: g, felder: ["sollJahr", "leerstandQuote", "restschuld", "ltv", "dscr"], sortierFeld: "leerstandQuote", zeilen: "top10" });
  }
  if (h) roh.push({ ...leer, typ: "TABELLE", titel: t.demoTitel.haeuser, abfrage: h, felder: ["flaeche", "sollJahr", "leerstandQuote"], sortierFeld: "leerstandQuote", zeilen: "top10" });
  if (kr) roh.push({ ...leer, typ: "TABELLE", titel: t.demoTitel.kredite, abfrage: kr, felder: KREDIT_FELDER, sortierFeld: "zinsbindungBis", absteigend: false, zeilen: "top10" });
  if (v) roh.push({ ...leer, typ: "LINIE", titel: t.demoTitel.linie, abfrage: v, felder: ["verkehrswert", "restschuld"] });
  roh.push({ ...leer, typ: "REGLER", titel: t.demoTitel.regler, objekt: "ALLE", regler: ["mietsteigerung", "zinsVariabelPP"] });
  return pruefeAntwort({ bausteine: roh }, daten, t);
}
