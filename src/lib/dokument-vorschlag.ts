/**
 * Vorschlag für Name, Kategorie, Jahr und Zuordnung beim Dokument-Upload. Reine Funktionen:
 * Grundlage sind nur der erkannte Text und der Dateiname; der Benutzer bestätigt vor dem Speichern.
 */

export type ObjektArt = "gesellschaft" | "haus" | "kredit";

/** Kategorien wie in der Dokumenten-Checkliste, plus häufige weitere. `bezug` = übliche Zuordnung. */
export const DOKUMENT_KATEGORIEN = [
  { name: "Jahresabschluss", bezug: "gesellschaft", jahrbezogen: true, woerter: ["jahresabschluss", "bilanz zum", "gewinn- und verlustrechnung", "anhang zum jahresabschluss"] },
  { name: "BWA", bezug: "gesellschaft", jahrbezogen: true, woerter: ["betriebswirtschaftliche auswertung", "bwa"] },
  { name: "Gesellschaftsvertrag", bezug: "gesellschaft", jahrbezogen: false, woerter: ["gesellschaftsvertrag", "satzung"] },
  { name: "Handelsregisterauszug", bezug: "gesellschaft", jahrbezogen: false, woerter: ["handelsregister", "registergericht", "hrb ", "hra "] },
  { name: "Gesellschafterliste", bezug: "gesellschaft", jahrbezogen: false, woerter: ["gesellschafterliste", "kommanditistenliste"] },
  { name: "Grundbuchauszug", bezug: "haus", jahrbezogen: false, woerter: ["grundbuch", "abteilung i", "flurstück", "gemarkung"] },
  { name: "Kaufvertrag", bezug: "haus", jahrbezogen: false, woerter: ["kaufvertrag", "urkundenrolle", "notar"] },
  { name: "Verkehrswertgutachten", bezug: "haus", jahrbezogen: false, woerter: ["verkehrswertgutachten", "gutachten", "wertermittlung", "liegenschaftszins"] },
  { name: "Energieausweis", bezug: "haus", jahrbezogen: false, woerter: ["energieausweis", "endenergiebedarf", "endenergieverbrauch"] },
  { name: "Nachweis Gebäudeversicherung", bezug: "haus", jahrbezogen: true, woerter: ["gebäudeversicherung", "versicherungsschein", "versicherungsnummer"] },
  { name: "Mietvertrag", bezug: "haus", jahrbezogen: false, woerter: ["mietvertrag", "vermieter", "mieter"] },
  { name: "Darlehensvertrag", bezug: "kredit", jahrbezogen: false, woerter: ["darlehensvertrag", "kreditvertrag", "darlehensnehmer"] },
  { name: "Saldenbestätigung", bezug: "kredit", jahrbezogen: true, woerter: ["saldenbestätigung", "saldenbestaetigung", "saldo zum", "kontostand zum"] },
  { name: "Kontoauszug", bezug: "kredit", jahrbezogen: false, woerter: ["kontoauszug", "buchungstag", "wertstellung"] },
] as const;

export type Kategorie = (typeof DOKUMENT_KATEGORIEN)[number]["name"];

const klein = (text: string) => text.toLocaleLowerCase("de-DE");
const kompakt = (text: string) => klein(text).replace(/[\s.\-/]/g, "");

/** Kategorie mit den meisten Stichwort-Treffern; Dateiname zählt doppelt. */
export function erkenneKategorie(text: string, dateiname: string): { kategorie: Kategorie; stichwort: string } | null {
  const t = klein(text);
  const d = klein(dateiname.replace(/[_\-.]/g, " "));
  let best: { kategorie: Kategorie; stichwort: string; punkte: number } | null = null;
  for (const k of DOKUMENT_KATEGORIEN) {
    let punkte = 0;
    let stichwort = "";
    for (const w of k.woerter) {
      const imText = t.split(w).length - 1;
      const imNamen = d.includes(w.trim()) ? 2 : 0;
      if (imText + imNamen > 0 && !stichwort) stichwort = w.trim();
      // Das erste (spezifischste) Wort zählt stärker
      punkte += (imText + imNamen) * (w === k.woerter[0] ? 3 : 1);
    }
    if (punkte > 0 && (!best || punkte > best.punkte)) best = { kategorie: k.name, stichwort, punkte };
  }
  return best && { kategorie: best.kategorie, stichwort: best.stichwort };
}

/** Jahr: „Geschäftsjahr 2025“, „zum 31.12.2025“, sonst eine Jahreszahl im Dateinamen. */
export function erkenneJahr(text: string, dateiname: string): number | null {
  const muster = [/gesch[äa]ftsjahr\s+(20\d{2})/i, /(?:zum|per|stichtag)\s+31\.\s?12\.\s?(20\d{2})/i, /jahresabschluss\s+(20\d{2})/i];
  for (const m of muster) {
    const treffer = m.exec(text);
    if (treffer) return Number(treffer[1]);
  }
  const imNamen = /(?:^|[^\d])(20\d{2})(?:[^\d]|$)/.exec(dateiname);
  return imNamen ? Number(imNamen[1]) : null;
}

const DATUM = /\b(\d{1,2})\.\s?(\d{1,2})\.\s?(20\d{2}|19\d{2})\b/g;

/**
 * Datum des Dokuments (TT.MM.JJJJ) als ISO-Datum: bevorzugt nach „ausgestellt am“, „Stand“, „Datum“,
 * „vom“; sonst das erste Datum, das kein Ablauf- oder Fristdatum („gültig bis“, „bis zum“) ist.
 */
export function erkenneDatum(text: string): string | null {
  const iso = (m: RegExpExecArray) => {
    const [tag, monat, jahr] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (monat < 1 || monat > 12 || tag < 1 || tag > 31) return null;
    return `${jahr}-${String(monat).padStart(2, "0")}-${String(tag).padStart(2, "0")}`;
  };
  const kandidaten = [...text.matchAll(DATUM)];
  const davor = (m: RegExpExecArray) => text.slice(Math.max(0, m.index - 25), m.index).toLocaleLowerCase("de-DE");
  const bevorzugt = kandidaten.find((m) => /(ausgestellt am|stand|datum|vom|den)\s*:?\s*$/.test(davor(m)));
  const erstes = bevorzugt ?? kandidaten.find((m) => !/(bis|bis zum|gültig bis|ablauf)\s*:?\s*$/.test(davor(m)));
  return erstes ? iso(erstes) : null;
}

export type ObjektKandidat = { art: ObjektArt; id: string; name: string; begriffe: string[] };

/**
 * Objekt, dessen Name oder Kennung (Straße, Kreditnummer, IBAN) im Text vorkommt. Kennungen
 * werden ohne Leerzeichen verglichen. Bei Gleichstand gewinnt die übliche Zuordnung der Kategorie.
 */
export function erkenneObjekt(text: string, kandidaten: ObjektKandidat[], bevorzugt: ObjektArt | null): { objekt: ObjektKandidat; begriff: string } | null {
  const t = klein(text);
  const tk = kompakt(text);
  let best: { objekt: ObjektKandidat; begriff: string; punkte: number } | null = null;
  for (const k of kandidaten) {
    let punkte = 0;
    let begriff = "";
    for (const b of [k.name, ...k.begriffe]) {
      if (!b || b.length < 4) continue;
      const treffer = t.includes(klein(b)) || (kompakt(b).length >= 8 && tk.includes(kompakt(b)));
      if (treffer) {
        punkte += b === k.name ? 3 : 2;
        begriff ||= b;
      }
    }
    if (punkte === 0) continue;
    if (k.art === bevorzugt) punkte += 1;
    if (!best || punkte > best.punkte) best = { objekt: k, begriff, punkte };
  }
  return best && { objekt: best.objekt, begriff: best.begriff };
}

/** Einheitlicher Name: „Kategorie Jahr – Objekt“, ohne Jahr mit Datum, sonst nur, was bekannt ist. */
export function einheitlicherName(v: { kategorie: string | null; jahr: number | null; datum: string | null; objekt: string | null }, ohneKategorie: string): string {
  const zeit = v.jahr ? String(v.jahr) : v.datum ? v.datum.split("-").reverse().join(".") : "";
  const kopf = [v.kategorie || ohneKategorie, zeit].filter(Boolean).join(" ");
  return v.objekt ? `${kopf} – ${v.objekt}` : kopf;
}

export const jahrbezogen = (kategorie: string | null) => DOKUMENT_KATEGORIEN.find((k) => k.name === kategorie)?.jahrbezogen ?? false;
export const ueblicheZuordnung = (kategorie: string | null): ObjektArt | null => DOKUMENT_KATEGORIEN.find((k) => k.name === kategorie)?.bezug ?? null;

/** Ausschnitt rund um die erste Fundstelle (Groß-/Kleinschreibung egal) für die Trefferliste. */
export function ausschnitt(text: string, begriff: string, umfeld = 80): { vor: string; treffer: string; nach: string } | null {
  const i = klein(text).indexOf(klein(begriff));
  if (i < 0) return null;
  const start = Math.max(0, i - umfeld);
  const ende = Math.min(text.length, i + begriff.length + umfeld);
  const rein = (s: string) => s.replace(/\s+/g, " ");
  return {
    vor: (start > 0 ? "… " : "") + rein(text.slice(start, i)),
    treffer: text.slice(i, i + begriff.length),
    nach: rein(text.slice(i + begriff.length, ende)) + (ende < text.length ? " …" : ""),
  };
}

/** Zerlegt einen Text in Teile mit markierten Fundstellen (für die Hervorhebung in der Ansicht). */
export function markiere(text: string, begriff: string): Array<{ text: string; treffer: boolean }> {
  if (!begriff) return [{ text, treffer: false }];
  const teile: Array<{ text: string; treffer: boolean }> = [];
  const t = klein(text);
  const b = klein(begriff);
  let pos = 0;
  for (let i = t.indexOf(b); i >= 0; i = t.indexOf(b, i + b.length)) {
    if (i > pos) teile.push({ text: text.slice(pos, i), treffer: false });
    teile.push({ text: text.slice(i, i + b.length), treffer: true });
    pos = i + b.length;
  }
  if (pos < text.length) teile.push({ text: text.slice(pos), treffer: false });
  return teile;
}

// ---------------------------------------------------------------------------
// Absender
// ---------------------------------------------------------------------------

export const ABSENDER_ARTEN = ["BANK", "HAUSVERWALTUNG", "GUTACHTER", "STEUERBERATER", "NOTAR", "BEHOERDE", "VERSICHERUNG", "MIETER", "GESELLSCHAFTER", "SONSTIGE"] as const;
export type AbsenderArt = (typeof ABSENDER_ARTEN)[number];

/** Stichwörter je Absender-Art (klein geschrieben); das erste ist am aussagekräftigsten. */
const ABSENDER_WOERTER: Array<{ art: AbsenderArt; woerter: string[] }> = [
  { art: "BANK", woerter: ["sparkasse", "volksbank", "raiffeisenbank", "landesbank", "hypothekenbank", "bank ag", "bank eg", "bausparkasse"] },
  { art: "HAUSVERWALTUNG", woerter: ["hausverwaltung", "immobilienverwaltung", "objektverwaltung", "wohnungsverwaltung", "property management"] },
  { art: "GUTACHTER", woerter: ["sachverständige", "sachverständiger", "gutachter", "sachverständigenbüro"] },
  { art: "STEUERBERATER", woerter: ["steuerberatungsgesellschaft", "steuerberater", "wirtschaftsprüfungsgesellschaft", "wirtschaftsprüfer"] },
  { art: "NOTAR", woerter: ["notarin", "notar ", "notariat"] },
  { art: "BEHOERDE", woerter: ["amtsgericht", "finanzamt", "grundbuchamt", "registergericht", "landratsamt", "bezirksamt", "stadtverwaltung"] },
  { art: "VERSICHERUNG", woerter: ["versicherung ag", "versicherungs-ag", "versicherungsgesellschaft", "versicherer"] },
];

/** Übliche Absender-Art je Kategorie, wenn der Text nichts Eindeutiges enthält. */
const ABSENDER_JE_KATEGORIE: Partial<Record<Kategorie, AbsenderArt>> = {
  Jahresabschluss: "STEUERBERATER",
  BWA: "STEUERBERATER",
  Handelsregisterauszug: "BEHOERDE",
  Grundbuchauszug: "BEHOERDE",
  Kaufvertrag: "NOTAR",
  Verkehrswertgutachten: "GUTACHTER",
  "Nachweis Gebäudeversicherung": "VERSICHERUNG",
  Darlehensvertrag: "BANK",
  Saldenbestätigung: "BANK",
  Kontoauszug: "BANK",
};

export type AbsenderVorschlag = {
  art: AbsenderArt;
  name: string | null;
  /** Begründung als Schlüssel und Begriff, z. B. { grund: "bekannteBank", begriff: "Sparkasse Hamburg" } */
  grund: "bekannteBank" | "stichwort" | "kategorie";
  begriff: string;
};

/** Zeile des Textes, in der das Stichwort steht (gekürzt) – als Vorschlag für den Namen. */
function zeileMit(text: string, wort: string): string | null {
  const zeile = text.split(/\r?\n/).find((z) => klein(z).includes(wort));
  if (!zeile) return null;
  // Nur der Satzteil mit dem Stichwort, z. B. „Amtsgericht Hamburg, Grundbuchamt“ statt der ganzen Zeile
  const sauber = (zeile.split(/\.\s/).find((teil) => klein(teil).includes(wort)) ?? zeile).replace(/\s+/g, " ").trim();
  return sauber.length > 80 ? null : sauber;
}

/**
 * Absender aus dem Kopf des Dokuments (erste 800 Zeichen, dort steht der Briefkopf) und der
 * Kategorie:
 * 1. eine bekannte Bank aus den Krediten des Mandanten,
 * 2. ein Stichwort einer Absender-Art (Sparkasse, Hausverwaltung, Sachverständiger …),
 * 3. die übliche Absender-Art der Kategorie (ohne Namen).
 * Hat die Kategorie eine übliche Absender-Art, zählen 1. und 2. nur, wenn sie dazu passen
 * (z. B. nennt ein Jahresabschluss Banken und das Registergericht, kommt aber vom Steuerberater).
 * Nur ein Vorschlag; der Benutzer bestätigt.
 */
export function erkenneAbsender(text: string, kategorie: string | null, bekannteBanken: string[]): AbsenderVorschlag | null {
  const kopf = text.slice(0, 800);
  const kk = klein(kopf);
  const ueblich = kategorie ? ABSENDER_JE_KATEGORIE[kategorie as Kategorie] : undefined;
  const passt = (art: AbsenderArt) => !ueblich || ueblich === art;
  if (passt("BANK")) {
    for (const bank of [...new Set(bekannteBanken)].filter((b) => b.length >= 4).sort((a, b) => b.length - a.length)) {
      if (kk.includes(klein(bank))) return { art: "BANK", name: bank, grund: "bekannteBank", begriff: bank };
    }
  }
  for (const { art, woerter } of ABSENDER_WOERTER) {
    if (!passt(art)) continue;
    for (const w of woerter) {
      if (kk.includes(w)) return { art, name: zeileMit(kopf, w), grund: "stichwort", begriff: w.trim() };
    }
  }
  return ueblich ? { art: ueblich, name: null, grund: "kategorie", begriff: kategorie! } : null;
}
