/**
 * Posteingang (reine Funktionen): Vorschlag für Kategorie, Absender, Stichtag und Zuordnung eines
 * eingehenden Dokuments mit Begründung, Bewertung der Sicherheit, Prüfung eines KI-Vorschlags
 * und Lernen aus Bestätigungen und Korrekturen.
 *
 * Grundsätze:
 * - Nichts wird automatisch übernommen; der Vorschlag wartet immer auf Bestätigung.
 * - „hoch“ nur bei eindeutigen Kennungen (IBAN, Darlehensnummer, gelernte Regel) ohne
 *   ernsthafte Konkurrenz. Namen und Adressen allein ergeben höchstens „mittel“.
 * - Ein KI-Vorschlag zählt nur, wenn sein wörtlicher Beleg im Text steht; er ergibt nie „hoch“.
 */
import {
  ABSENDER_ARTEN,
  DOKUMENT_KATEGORIEN,
  einheitlicherName,
  erkenneAbsender,
  erkenneDatum,
  erkenneJahr,
  erkenneKategorie,
  jahrbezogen,
  ueblicheZuordnung,
  type AbsenderArt,
  type ObjektArt,
} from "./dokument-vorschlag";

export type Sicherheit = "hoch" | "mittel" | "niedrig";

/** Begründung als i18n-Schlüssel (`t.eingang.gruende`) mit Werten. */
export type Grund = {
  schluessel: "regel" | "iban" | "kennung" | "adresse" | "name" | "ueblich" | "kategorie" | "jahr" | "datum" | "absender" | "absenderRegel" | "uploadLink" | "mailAbsender" | "ki" | "kiAbweichung" | "konkurrenz" | "keinObjekt";
  werte: Record<string, string>;
};

export type ObjektRef = { art: ObjektArt; id: string; name: string };

export interface EingangVorschlag {
  titel: string;
  kategorie: string | null;
  jahr: number | null;
  datum: string | null;
  absenderArt: AbsenderArt | null;
  absenderName: string | null;
  objekt: ObjektRef | null;
  sicherheit: Sicherheit;
  gruende: Grund[];
  /** Weitere mögliche Objekte (bei knapper Entscheidung) */
  konkurrenz: ObjektRef[];
  /** Modell, falls die KI mitgewirkt hat */
  kiModell: string | null;
}

/** Objekt mit den Kennungen, an denen es erkannt werden kann. */
export interface EingangKandidat extends ObjektRef {
  ibans: string[];
  kennungen: string[];
  adressen: string[];
  namen: string[];
}

export type Regel = {
  merkmal: "IBAN" | "KENNUNG" | "ABSENDER_ADRESSE" | "ABSENDER_NAME";
  wert: string;
  objekt: ObjektRef | null;
  absenderArt: AbsenderArt | null;
  absenderName: string | null;
  geaendertAm: string;
};

export const normalisiere = (wert: string) => wert.toLocaleLowerCase("de-DE").replace(/[\s.\-/]/g, "");

/** IBANs im Text (deutsch und allgemein), normalisiert ohne Leerzeichen, groß geschrieben. */
export function findeIbans(text: string): string[] {
  const treffer = text.match(/\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){3,7}(?:[ ]?[A-Z0-9]{1,3})?\b/g) ?? [];
  return [...new Set(treffer.map((x) => x.replace(/\s/g, "").toUpperCase()).filter((x) => x.length >= 15 && x.length <= 34 && /^[A-Z]{2}\d{2}/.test(x)))];
}

/** Darlehens-, Kredit-, Konto- und Vertragsnummern nach einem Stichwort. */
export function findeKennungen(text: string): string[] {
  const muster = /(?:darlehens|kredit|konto|vertrags|finanzierungs)[-\s]?(?:nr\.?|nummer|konto)\s*:?\s*([A-Z0-9][A-Z0-9\-/.]{3,24}[A-Z0-9])/gi;
  return [...new Set([...text.matchAll(muster)].map((m) => m[1]).filter((x) => /\d/.test(x)))];
}

const enthaelt = (text: string, begriff: string) => {
  const b = normalisiere(begriff);
  return b.length >= 5 && normalisiere(text).includes(b);
};

/** Objekte nach Punkten: Regel 10, IBAN 8, Kennung 8, Adresse 4, Name 3, übliche Zuordnung 1. */
export function bewerteObjekte(text: string, kandidaten: EingangKandidat[], regeln: Regel[], bevorzugt: ObjektArt | null) {
  const ibans = findeIbans(text);
  const kennungen = findeKennungen(text).map(normalisiere);
  const textIbans = new Set(ibans.map(normalisiere));
  const liste: Array<{ objekt: ObjektRef; punkte: number; gruende: Grund[] }> = [];
  const finde = (o: ObjektRef) => {
    let e = liste.find((x) => x.objekt.art === o.art && x.objekt.id === o.id);
    if (!e) liste.push((e = { objekt: { art: o.art, id: o.id, name: o.name }, punkte: 0, gruende: [] }));
    return e;
  };
  for (const r of regeln) {
    if (!r.objekt) continue;
    const passt = (r.merkmal === "IBAN" && textIbans.has(r.wert)) || (r.merkmal === "KENNUNG" && (kennungen.includes(r.wert) || enthaelt(text, r.wert)));
    if (!passt) continue;
    const e = finde(r.objekt);
    e.punkte += 10;
    e.gruende.push({ schluessel: "regel", werte: { merkmal: r.merkmal, wert: r.wert.toUpperCase(), datum: r.geaendertAm.slice(0, 10) } });
  }
  for (const k of kandidaten) {
    const gruende: Grund[] = [];
    let punkte = 0;
    const treffer = (p: number, schluessel: string, wert: string) => {
      punkte += p;
      gruende.push({ schluessel, werte: { wert } } as Grund);
    };
    for (const iban of k.ibans) if (iban && textIbans.has(normalisiere(iban))) treffer(8, "iban", iban);
    for (const kn of k.kennungen) if (kn && (kennungen.includes(normalisiere(kn)) || enthaelt(text, kn))) treffer(8, "kennung", kn);
    for (const a of k.adressen) if (a && a.length >= 6 && enthaelt(text, a)) treffer(4, "adresse", a);
    for (const n of k.namen) if (n && n.length >= 6 && enthaelt(text, n)) treffer(3, "name", n);
    if (punkte === 0) continue;
    const e = finde(k);
    e.punkte += punkte + (k.art === bevorzugt ? 1 : 0);
    e.gruende.push(...gruende);
    if (k.art === bevorzugt) e.gruende.push({ schluessel: "ueblich", werte: {} });
  }
  return liste.sort((a, b) => b.punkte - a.punkte);
}

/** Sicherheit der besten Zuordnung gegenüber der zweitbesten. */
export function sicherheitAus(beste: number, zweite: number): Sicherheit {
  if (beste >= 8 && beste - zweite >= 4) return "hoch";
  if (beste >= 3 && beste - zweite >= 2) return "mittel";
  return "niedrig";
}

/** Vorschlag nur aus Regeln und Text (ohne KI). */
export function schlageVor(e: {
  text: string;
  dateiname: string;
  kandidaten: EingangKandidat[];
  regeln: Regel[];
  banken: string[];
  absenderAdresse: string | null;
  ohneKategorie: string;
}): EingangVorschlag {
  const gruende: Grund[] = [];
  const kat = erkenneKategorie(e.text, e.dateiname);
  const kategorie = kat?.kategorie ?? null;
  if (kat) gruende.push({ schluessel: "kategorie", werte: { kategorie: kat.kategorie, wort: kat.stichwort } });
  const jahr = jahrbezogen(kategorie) ? erkenneJahr(e.text, e.dateiname) : null;
  const datum = jahr ? null : erkenneDatum(e.text);
  if (jahr) gruende.push({ schluessel: "jahr", werte: { jahr: String(jahr) } });
  if (datum) gruende.push({ schluessel: "datum", werte: { datum } });

  // Absender: gelernte Regel (Adresse, Name im Kopf) vor der Erkennung aus dem Text
  let absenderArt: AbsenderArt | null = null;
  let absenderName: string | null = null;
  const kopf = e.text.slice(0, 800);
  const regelAbs =
    (e.absenderAdresse && e.regeln.find((r) => r.merkmal === "ABSENDER_ADRESSE" && r.wert === normalisiere(e.absenderAdresse!) && r.absenderArt)) ||
    e.regeln.find((r) => r.merkmal === "ABSENDER_NAME" && r.absenderArt && enthaelt(kopf, r.wert));
  if (regelAbs) {
    absenderArt = regelAbs.absenderArt;
    absenderName = regelAbs.absenderName;
    gruende.push({ schluessel: "absenderRegel", werte: { wert: regelAbs.merkmal === "ABSENDER_ADRESSE" ? e.absenderAdresse! : regelAbs.absenderName ?? regelAbs.wert, datum: regelAbs.geaendertAm.slice(0, 10) } });
  } else {
    const abs = erkenneAbsender(e.text, kategorie, e.banken);
    if (abs) {
      absenderArt = abs.art;
      absenderName = abs.name;
      gruende.push({ schluessel: "absender", werte: { art: abs.art, grund: abs.grund, begriff: abs.begriff } });
    }
  }

  const bewertung = bewerteObjekte(e.text, e.kandidaten, e.regeln, ueblicheZuordnung(kategorie));
  const [beste, zweite] = bewertung;
  const sicherheit = beste ? sicherheitAus(beste.punkte, zweite?.punkte ?? 0) : "niedrig";
  const objekt = beste && sicherheit !== "niedrig" ? beste.objekt : null;
  if (beste && objekt) gruende.push(...beste.gruende);
  const konkurrenz = bewertung.filter((x) => x !== beste || !objekt).slice(0, 3).map((x) => x.objekt);
  if (!objekt) gruende.push({ schluessel: beste ? "konkurrenz" : "keinObjekt", werte: { namen: konkurrenz.map((k) => k.name).join(", ") } });

  return {
    titel: einheitlicherName({ kategorie, jahr, datum, objekt: objekt?.name ?? null }, e.ohneKategorie),
    kategorie,
    jahr,
    datum,
    absenderArt,
    absenderName,
    objekt,
    sicherheit,
    gruende,
    konkurrenz,
    kiModell: null,
  };
}

// ---------------------------------------------------------------------------
// KI-Vorschlag prüfen und einarbeiten
// ---------------------------------------------------------------------------

export const EINGANG_KI_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["kategorie", "absenderArt", "absenderName", "datum", "jahr", "objekt", "beleg", "begruendung"],
  properties: {
    kategorie: { type: "string", enum: ["", ...DOKUMENT_KATEGORIEN.map((k) => k.name)] },
    absenderArt: { type: "string", enum: ["", ...ABSENDER_ARTEN] },
    absenderName: { type: "string" },
    datum: { type: "string" },
    jahr: { type: "string" },
    objekt: { type: "string" },
    beleg: { type: "string" },
    begruendung: { type: "string" },
  },
};

export type KiErkennung = { kategorie: string; absenderArt: string; absenderName: string; datum: string; jahr: string; objekt: string; beleg: string; begruendung: string };

const kompaktText = (s: string) => s.toLocaleLowerCase("de-DE").replace(/\s+/g, " ").trim();
const deDatum = (iso: string) => iso.split("-").reverse().join(".");

/**
 * Arbeitet den KI-Vorschlag ein. Objekt nur aus der Kandidatenliste (Kürzel O1, O2 …) und nur,
 * wenn der Beleg wörtlich im Text steht; Datum und Jahr nur, wenn sie im Text vorkommen.
 * Die KI hebt die Sicherheit nie auf „hoch“; widerspricht sie einer sicheren Regel, sinkt die
 * Sicherheit auf „mittel“.
 */
export function kombiniereKi(v: EingangVorschlag, ki: KiErkennung, text: string, codes: Map<string, ObjektRef>, modell: string, ohneKategorie: string): EingangVorschlag {
  const r: EingangVorschlag = { ...v, gruende: [...v.gruende], konkurrenz: [...v.konkurrenz], kiModell: modell };
  const t = kompaktText(text);
  const beleg = kompaktText(ki.beleg ?? "");
  const belegOk = beleg.length >= 4 && t.includes(beleg);
  if (!r.kategorie && DOKUMENT_KATEGORIEN.some((k) => k.name === ki.kategorie)) r.kategorie = ki.kategorie;
  if (!r.absenderArt && ABSENDER_ARTEN.includes(ki.absenderArt as AbsenderArt)) {
    r.absenderArt = ki.absenderArt as AbsenderArt;
    r.absenderName = ki.absenderName?.trim().slice(0, 200) || null;
  }
  if (!r.datum && !r.jahr && /^\d{4}-\d{2}-\d{2}$/.test(ki.datum) && text.replace(/\s/g, "").includes(deDatum(ki.datum))) r.datum = ki.datum;
  if (!r.jahr && /^(19|20)\d{2}$/.test(ki.jahr) && jahrbezogen(r.kategorie) && text.includes(ki.jahr)) r.jahr = Number(ki.jahr);

  const kiObjekt = codes.get(ki.objekt?.trim().toUpperCase()) ?? null;
  if (kiObjekt && belegOk) {
    const gleich = r.objekt && r.objekt.art === kiObjekt.art && r.objekt.id === kiObjekt.id;
    if (gleich) r.gruende.push({ schluessel: "ki", werte: { beleg: ki.beleg.trim().slice(0, 160), begruendung: ki.begruendung.trim().slice(0, 300) } });
    else if (!r.objekt) {
      r.objekt = kiObjekt;
      r.sicherheit = "mittel";
      r.gruende = r.gruende.filter((g) => g.schluessel !== "konkurrenz" && g.schluessel !== "keinObjekt");
      r.gruende.push({ schluessel: "ki", werte: { beleg: ki.beleg.trim().slice(0, 160), begruendung: ki.begruendung.trim().slice(0, 300) } });
    } else {
      if (r.sicherheit === "hoch") r.sicherheit = "mittel";
      r.konkurrenz = [kiObjekt, ...r.konkurrenz.filter((k) => k.id !== kiObjekt.id)].slice(0, 3);
      r.gruende.push({ schluessel: "kiAbweichung", werte: { objekt: kiObjekt.name, beleg: ki.beleg.trim().slice(0, 160) } });
    }
  }
  r.titel = einheitlicherName({ kategorie: r.kategorie, jahr: r.jahr, datum: r.datum, objekt: r.objekt?.name ?? null }, ohneKategorie);
  return r;
}

// ---------------------------------------------------------------------------
// Lernen
// ---------------------------------------------------------------------------

export type NeueRegel = { merkmal: Regel["merkmal"]; wert: string; objekt: ObjektRef | null; absenderArt: AbsenderArt | null; absenderName: string | null };

/**
 * Regeln aus der Bestätigung: IBANs und Kennungen im Text, die noch keinem Objekt gehören, zeigen
 * künftig auf das bestätigte Objekt; Absender-Adresse und -Name auf den bestätigten Absender.
 * Kennungen, die bekannt einem anderen Objekt gehören, werden nicht umgelernt.
 */
export function lerneRegeln(e: {
  text: string;
  absenderAdresse: string | null;
  kandidaten: EingangKandidat[];
  objekt: ObjektRef | null;
  absenderArt: AbsenderArt | null;
  absenderName: string | null;
}): NeueRegel[] {
  const regeln: NeueRegel[] = [];
  const bekannt = new Set(e.kandidaten.flatMap((k) => [...k.ibans, ...k.kennungen]).filter(Boolean).map(normalisiere));
  if (e.objekt) {
    for (const iban of findeIbans(e.text)) {
      const w = normalisiere(iban);
      if (!bekannt.has(w)) regeln.push({ merkmal: "IBAN", wert: w, objekt: e.objekt, absenderArt: null, absenderName: null });
    }
    for (const k of findeKennungen(e.text)) {
      const w = normalisiere(k);
      if (w.length >= 5 && !bekannt.has(w)) regeln.push({ merkmal: "KENNUNG", wert: w, objekt: e.objekt, absenderArt: null, absenderName: null });
    }
  }
  if (e.absenderArt) {
    if (e.absenderAdresse) regeln.push({ merkmal: "ABSENDER_ADRESSE", wert: normalisiere(e.absenderAdresse), objekt: null, absenderArt: e.absenderArt, absenderName: e.absenderName });
    if (e.absenderName && normalisiere(e.absenderName).length >= 5 && enthaelt(e.text.slice(0, 800), e.absenderName)) {
      regeln.push({ merkmal: "ABSENDER_NAME", wert: normalisiere(e.absenderName), objekt: null, absenderArt: e.absenderArt, absenderName: e.absenderName });
    }
  }
  return regeln;
}
