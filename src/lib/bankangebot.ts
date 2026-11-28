/**
 * Bankangebote (Term Sheets): Auslesen der Konditionen aus dem Text (Vorschlag mit Beleg) und
 * Vergleich nebeneinander. Gerechnet wird nur hier im Code; die KI liefert höchstens Textstellen.
 */
import { dezimal, type Decimal } from "@/lib/geld";
import { plusMonate, plusTage, type IsoDatum } from "@/lib/datum";
import { PERIODEN_PRO_JAHR, berechneTilgungsplan, referenzzinsAm, type ReferenzWert, type TilgungsartArt, type ZahlweiseArt } from "@/lib/kredit";

export const ANGEBOT_FELDER = [
  "bank",
  "betrag",
  "zinsArt",
  "sollzins",
  "referenzzins",
  "marge",
  "zinsbindungMonate",
  "laufzeitMonate",
  "tilgungProzent",
  "auszahlungProzent",
  "bearbeitungsgebuehr",
  "sonstigeKosten",
  "bereitstellungszins",
  "bereitstellungsfreiMonate",
  "sondertilgungProzent",
  "covenants",
  "sicherheiten",
  "angebotVom",
  "gueltigBis",
] as const;
export type AngebotFeld = (typeof ANGEBOT_FELDER)[number];

/** Ausgelesener Wert als Text (wie im Formular), mit wörtlichem Beleg und Herkunft. */
export type FeldVorschlag = { wert: string; beleg: string; herkunft: "regel" | "ki" | "berechnet"; hinweis?: string };
export type AngebotVorschlag = Partial<Record<AngebotFeld, FeldVorschlag>>;

const ZAHL = "(\\d{1,3}(?:\\.\\d{3})*(?:,\\d{1,6})?|\\d+(?:[.,]\\d{1,6})?)";

/** Deutsche Zahl („1.234.567,89“ oder „3,85“) als Text mit Punkt („1234567.89“). */
export function deZahl(text: string): string | null {
  const t = text.trim();
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) return t.replace(/\./g, "").replace(",", ".");
  if (/^\d+(,\d+)?$/.test(t)) return t.replace(",", ".");
  if (/^\d+\.\d{1,2}$/.test(t)) return t;
  return null;
}

/** „1234567.5“ → „1.234.567,5“ (nur Textumformung, keine Rechnung) */
function deutschMitPunkten(z: string) {
  const [ganz, rest] = z.split(".");
  return ganz.replace(/\B(?=(\d{3})+(?!\d))/g, ".") + (rest ? `,${rest}` : "");
}

const deDatumIso = (d: string) => {
  const m = d.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
};

/** Zeile (bzw. Satzteil) um eine Fundstelle als Beleg. */
function beleg(text: string, index: number, laenge: number) {
  const start = Math.max(0, text.lastIndexOf("\n", index) + 1);
  const ende = text.indexOf("\n", index + laenge);
  return text.slice(start, ende === -1 ? undefined : ende).trim().slice(0, 200);
}

function suche(text: string, muster: RegExp, gruppe = 1): { wert: string; beleg: string } | null {
  const m = muster.exec(text);
  if (!m || m[gruppe] === undefined) return null;
  return { wert: m[gruppe], beleg: beleg(text, m.index, m[0].length) };
}

/**
 * Liest Konditionen nach festen Mustern aus (ohne KI). Nur Werte, die wörtlich im Text stehen;
 * Umrechnungen (Jahre in Monate, Gebühr in % in Euro) werden als „berechnet“ gekennzeichnet.
 */
export function leseAngebot(text: string, bekannteBanken: string[] = []): AngebotVorschlag {
  const v: AngebotVorschlag = {};
  const setze = (feld: AngebotFeld, wert: string | null, b: string | undefined, herkunft: FeldVorschlag["herkunft"] = "regel", hinweis?: string) => {
    if (wert !== null && b && !v[feld]) v[feld] = { wert, beleg: b, herkunft, ...(hinweis ? { hinweis } : {}) };
  };
  const bank = bekannteBanken.find((b) => b.length >= 4 && text.toLowerCase().includes(b.toLowerCase()));
  if (bank) setze("bank", bank, beleg(text, text.toLowerCase().indexOf(bank.toLowerCase()), bank.length));

  const betrag = suche(text, new RegExp(`(?:Darlehensbetrag|Kreditbetrag|Nominalbetrag|Finanzierungsbetrag|Darlehenssumme)[^\\d\\n]{0,30}${ZAHL}\\s*(?:EUR|€|Euro)`, "i"));
  if (betrag) setze("betrag", deZahl(betrag.wert), betrag.beleg);

  const ref = suche(text, /\b(\d{1,2})\s*(?:M|-?Monats)[- ]?EURIBOR/i);
  if (ref) {
    setze("zinsArt", "VARIABEL", ref.beleg);
    setze("referenzzins", `${ref.wert}M-EURIBOR`, ref.beleg);
  }
  const marge = suche(text, new RegExp(`(?:Marge|Aufschlag|Kreditmarge|Zinsaufschlag)[^\\d\\n]{0,40}${ZAHL}\\s*(?:%|Prozent)`, "i"));
  if (marge) setze("marge", deZahl(marge.wert), marge.beleg);
  const zins = suche(text, new RegExp(`(?:Sollzins|Nominalzins|Festzins|Zinssatz|gebundener Sollzins)[^\\d\\n]{0,40}${ZAHL}\\s*(?:%|Prozent)`, "i"));
  if (zins) {
    setze("sollzins", deZahl(zins.wert), zins.beleg);
    if (!ref) setze("zinsArt", "FEST", zins.beleg);
  }

  const jahreAlsMonate = (feld: AngebotFeld, muster: RegExp) => {
    const r = suche(text, muster);
    if (!r) return;
    const z = deZahl(r.wert);
    if (z === null) return;
    const monate = r.beleg.match(new RegExp(`${r.wert.replace(/[.,]/g, "[.,]")}\\s*Monat`, "i")) ? dezimal(z) : dezimal(z).times(12);
    setze(feld, monate.toDecimalPlaces(0).toFixed(0), r.beleg, monate.equals(dezimal(z)) ? "regel" : "berechnet");
  };
  jahreAlsMonate("zinsbindungMonate", /Zinsbindung[^\d\n]{0,30}(\d{1,2}(?:,\d)?|\d{2,3})\s*(?:Jahre|Jahr|Monate)/i);
  jahreAlsMonate("laufzeitMonate", /(?:Laufzeit|Gesamtlaufzeit)[^\d\n]{0,30}(\d{1,2}(?:,\d)?|\d{2,3})\s*(?:Jahre|Jahr|Monate)/i);

  const tilgung = suche(text, new RegExp(`(?:anf[äa]ngliche Tilgung|Tilgung(?:ssatz)?)[^\\d\\n]{0,30}${ZAHL}\\s*(?:%|Prozent)`, "i"));
  if (tilgung) setze("tilgungProzent", deZahl(tilgung.wert), tilgung.beleg);
  const auszahlung = suche(text, new RegExp(`(?:Auszahlung(?:skurs)?|Auszahlungsbetrag)[^\\d\\n]{0,30}${ZAHL}\\s*(?:%|Prozent)`, "i"));
  if (auszahlung) setze("auszahlungProzent", deZahl(auszahlung.wert), auszahlung.beleg);
  const disagio = suche(text, new RegExp(`Disagio[^\\d\\n]{0,30}${ZAHL}\\s*(?:%|Prozent)`, "i"));
  if (disagio && !auszahlung && deZahl(disagio.wert)) setze("auszahlungProzent", dezimal(100).minus(dezimal(deZahl(disagio.wert)!)).toFixed(), disagio.beleg, "berechnet", "100 % − Disagio");

  const gebuehrEur = suche(text, new RegExp(`(?:Bearbeitungsgeb[üu]hr|Bearbeitungsentgelt|Arrangement Fee|Upfront Fee|Strukturierungsgeb[üu]hr)[^\\d\\n]{0,30}${ZAHL}\\s*(?:EUR|€|Euro)`, "i"));
  if (gebuehrEur) setze("bearbeitungsgebuehr", deZahl(gebuehrEur.wert), gebuehrEur.beleg);
  const gebuehrProzent = suche(text, new RegExp(`(?:Bearbeitungsgeb[üu]hr|Bearbeitungsentgelt|Arrangement Fee|Upfront Fee|Strukturierungsgeb[üu]hr)[^\\d\\n]{0,30}${ZAHL}\\s*(?:%|Prozent)`, "i"));
  if (gebuehrProzent && !gebuehrEur && v.betrag && deZahl(gebuehrProzent.wert)) {
    const euro = dezimal(v.betrag.wert).times(dezimal(deZahl(gebuehrProzent.wert)!)).dividedBy(100).toDecimalPlaces(2);
    setze("bearbeitungsgebuehr", euro.toFixed(2), gebuehrProzent.beleg, "berechnet", `${gebuehrProzent.wert} % × Darlehensbetrag`);
  }
  const sonstige = suche(text, new RegExp(`(?:Wertermittlungsgeb[üu]hr|Schätzkosten|Gutachterkosten|sonstige Kosten)[^\\d\\n]{0,30}${ZAHL}\\s*(?:EUR|€|Euro)`, "i"));
  if (sonstige) setze("sonstigeKosten", deZahl(sonstige.wert), sonstige.beleg);
  const bereit = suche(text, new RegExp(`Bereitstellungs(?:zins|provision)[^\\d\\n]{0,30}${ZAHL}\\s*(?:%|Prozent)`, "i"));
  if (bereit) setze("bereitstellungszins", deZahl(bereit.wert), bereit.beleg);
  const frei = suche(text, /(\d{1,2})\s*Monate\s*(?:bereitstellungs(?:zins|provisions)?frei|ohne Bereitstellungs)/i);
  if (frei) setze("bereitstellungsfreiMonate", frei.wert, frei.beleg);
  const sonder = suche(text, new RegExp(`Sondertilgung[^\\n]{0,60}?${ZAHL}\\s*(?:%|Prozent)`, "i"));
  if (sonder) setze("sondertilgungProzent", deZahl(sonder.wert), sonder.beleg);

  const zeilen = text.split("\n").map((z) => z.trim()).filter(Boolean);
  const covenants = zeilen.filter((z) => /\b(LTV|DSCR|ICR|Covenant|Financial Covenant|Beleihungsauslauf|Schuldendienstdeckung)\b/i.test(z));
  if (covenants.length) setze("covenants", covenants.slice(0, 6).join("\n").slice(0, 1000), covenants[0]);
  const sicherheiten = zeilen.filter((z) => /(Grundschuld|Bürgschaft|Buergschaft|Abtretung|Verpfändung|Patronat)/i.test(z));
  if (sicherheiten.length) setze("sicherheiten", sicherheiten.slice(0, 6).join("\n").slice(0, 1000), sicherheiten[0]);

  const gueltig = suche(text, /(?:gültig bis|Bindefrist(?: bis)?|Annahmefrist(?: bis)?)[^\d\n]{0,10}(\d{1,2}\.\d{1,2}\.\d{4})/i);
  if (gueltig) setze("gueltigBis", deDatumIso(gueltig.wert), gueltig.beleg);
  const datum = suche(text, /(?:Datum|Stand|vom)[^\d\n]{0,10}(\d{1,2}\.\d{1,2}\.\d{4})/i) ?? suche(text, /\b(\d{1,2}\.\d{1,2}\.\d{4})\b/);
  if (datum && datum.wert !== gueltig?.wert) setze("angebotVom", deDatumIso(datum.wert), datum.beleg);
  return v;
}

/** Prüft einen KI-Vorschlag: der Beleg muss wörtlich im Text stehen und den Wert enthalten. */
export function pruefeKiFeld(text: string, feld: AngebotFeld, wert: string, belegText: string): FeldVorschlag | null {
  const kompakt = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const b = kompakt(belegText ?? "");
  if (b.length < 4 || !kompakt(text).includes(b) || !wert?.trim()) return null;
  const w = wert.trim();
  const zahlFelder: AngebotFeld[] = ["betrag", "sollzins", "marge", "tilgungProzent", "auszahlungProzent", "bearbeitungsgebuehr", "sonstigeKosten", "bereitstellungszins", "sondertilgungProzent", "bereitstellungsfreiMonate"];
  if (zahlFelder.includes(feld)) {
    const z = deZahl(w) ?? (/^\d+(\.\d+)?$/.test(w) ? w : null);
    if (z === null) return null;
    // Die Zahl muss im Beleg stehen (deutsch oder mit Punkt geschrieben)
    const varianten = [z, z.replace(".", ","), dezimal(z).toFixed(2).replace(".", ","), deutschMitPunkten(z)];
    if (!varianten.some((x) => b.includes(x.toLowerCase()))) return null;
    return { wert: z, beleg: belegText.trim().slice(0, 200), herkunft: "ki" };
  }
  if (feld === "zinsbindungMonate" || feld === "laufzeitMonate") {
    if (!/^\d{1,3}$/.test(w)) return null;
    const jahre = Number(w) % 12 === 0 ? String(Number(w) / 12) : null;
    if (!b.includes(w) && !(jahre && b.includes(jahre))) return null;
    return { wert: w, beleg: belegText.trim().slice(0, 200), herkunft: jahre && !b.includes(w) ? "berechnet" : "ki" };
  }
  if (feld === "angebotVom" || feld === "gueltigBis") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(w)) return null;
    const [j, m, t] = w.split("-");
    if (!b.includes(`${t}.${m}.${j}`) && !b.includes(`${Number(t)}.${Number(m)}.${j}`)) return null;
    return { wert: w, beleg: belegText.trim().slice(0, 200), herkunft: "ki" };
  }
  if (feld === "zinsArt" && w !== "FEST" && w !== "VARIABEL") return null;
  return { wert: w.slice(0, 1000), beleg: belegText.trim().slice(0, 200), herkunft: "ki" };
}

/** Antwort der KI: je Feld Wert (Text) und wörtlicher Beleg; der Code prüft beides. */
export const ANGEBOT_KI_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["felder"],
  properties: {
    felder: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["feld", "wert", "beleg"],
        properties: { feld: { type: "string", enum: [...ANGEBOT_FELDER] }, wert: { type: "string" }, beleg: { type: "string" } },
      },
    },
  },
};

/**
 * Ergänzt den Regel-Vorschlag um geprüfte KI-Werte (nur leere Felder; Regel-Werte bleiben).
 * Weicht die KI bei einem Feld ab, wird das als Hinweis vermerkt, nicht übernommen.
 */
export function kombiniereAngebotKi(regel: AngebotVorschlag, ki: Array<{ feld: string; wert: string; beleg: string }>, text: string): AngebotVorschlag {
  const r: AngebotVorschlag = { ...regel };
  for (const k of ki) {
    if (!(ANGEBOT_FELDER as readonly string[]).includes(k.feld)) continue;
    const feld = k.feld as AngebotFeld;
    const g = pruefeKiFeld(text, feld, k.wert, k.beleg);
    if (!g) continue;
    const vorhanden = r[feld];
    if (!vorhanden) r[feld] = g;
    else if (vorhanden.wert !== g.wert && !vorhanden.hinweis) r[feld] = { ...vorhanden, hinweis: `KI: ${g.wert}` };
  }
  return r;
}

// ---------------------------------------------------------------------------
// Vergleich
// ---------------------------------------------------------------------------

export interface AngebotDaten {
  id: string;
  name: string;
  betrag: Decimal | null;
  zinsArt: "FEST" | "VARIABEL";
  sollzins: Decimal | null;
  referenzzins: string | null;
  marge: Decimal | null;
  zinsbindungMonate: number | null;
  laufzeitMonate: number | null;
  zahlweise: ZahlweiseArt;
  tilgungsart: TilgungsartArt;
  tilgungProzent: Decimal | null;
  /** 100 = volle Auszahlung; darunter Disagio */
  auszahlungProzent: Decimal | null;
  bearbeitungsgebuehr: Decimal | null;
  sonstigeKosten: Decimal | null;
}

export type AngebotLuecke = "betrag" | "zins" | "tilgung" | "zinsbindungKuerzer" | "referenzzins" | "gebuehren" | "auszahlung";

export interface AngebotErgebnis {
  id: string;
  /** Verwendeter Zinssatz in Prozentpunkten und woher er stammt */
  zinssatz: Decimal | null;
  zinsHerkunft: { art: "fest" } | { art: "variabel"; referenz: string; satz: Decimal; stichtag: IsoDatum; marge: Decimal } | null;
  rate: Decimal | null;
  zinsen: Decimal | null;
  tilgung: Decimal | null;
  restschuld: Decimal | null;
  disagio: Decimal | null;
  gebuehren: Decimal | null;
  gesamtkosten: Decimal | null;
  /** Effektiver Jahreszins über den Vergleichszeitraum (eigene Berechnung, Kosten und Disagio eingerechnet) */
  effektivzins: Decimal | null;
  perioden: number;
  luecken: AngebotLuecke[];
}

const NULL = dezimal(0);

/** Monatlicher bzw. periodischer interner Zins per Intervallhalbierung (Decimal, ohne Gleitkomma). */
function internerZins(netto: Decimal, zahlungen: Decimal[]): Decimal | null {
  if (netto.lessThanOrEqualTo(0) || zahlungen.length === 0) return null;
  const barwert = (r: Decimal) => {
    let summe = NULL;
    let faktor = dezimal(1);
    const q = dezimal(1).plus(r);
    for (const z of zahlungen) {
      faktor = faktor.dividedBy(q);
      summe = summe.plus(z.times(faktor));
    }
    return summe;
  };
  let lo = dezimal(0);
  let hi = dezimal("0.05");
  if (barwert(lo).lessThan(netto)) return null; // Zahlungen kleiner als Auszahlung: kein positiver Zins
  for (let i = 0; i < 60; i++) {
    const mitte = lo.plus(hi).dividedBy(2);
    if (barwert(mitte).greaterThan(netto)) lo = mitte;
    else hi = mitte;
  }
  return lo.plus(hi).dividedBy(2);
}

/**
 * Vergleicht Angebote über denselben Zeitraum (Monate ab `start`). Fester Zins gilt bis zum Ende
 * der Zinsbindung; reicht sie nicht bis zum Ende des Zeitraums, bleiben die Kosten unbekannt.
 * Variabler Zins: Referenzzins am Stichtag plus Marge, im Zeitraum fortgeschrieben (gekennzeichnet).
 */
export function vergleicheAngebote(angebote: AngebotDaten[], monate: number, start: IsoDatum, referenzwerte: ReferenzWert[]): AngebotErgebnis[] {
  return angebote.map((a) => {
    const luecken: AngebotLuecke[] = [];
    let zins: Decimal | null = null;
    let herkunft: AngebotErgebnis["zinsHerkunft"] = null;
    if (a.zinsArt === "FEST") {
      zins = a.sollzins;
      if (zins) herkunft = { art: "fest" };
      if (a.zinsbindungMonate !== null && a.zinsbindungMonate < monate) luecken.push("zinsbindungKuerzer");
    } else if (a.referenzzins && a.marge) {
      const ref = referenzzinsAm(referenzwerte, a.referenzzins, start);
      if (ref) {
        zins = (ref.satz.lessThan(0) ? NULL : ref.satz).plus(a.marge);
        herkunft = { art: "variabel", referenz: a.referenzzins, satz: ref.satz, stichtag: ref.stichtag, marge: a.marge };
      } else luecken.push("referenzzins");
    } else if (a.sollzins) {
      zins = a.sollzins;
      herkunft = { art: "fest" };
    }
    if (!a.betrag) luecken.push("betrag");
    if (!zins && !luecken.includes("referenzzins")) luecken.push("zins");
    if (a.tilgungsart !== "ENDFAELLIG" && !a.tilgungProzent) luecken.push("tilgung");
    if (a.bearbeitungsgebuehr === null) luecken.push("gebuehren");
    if (a.auszahlungProzent === null) luecken.push("auszahlung");

    const leer: AngebotErgebnis = { id: a.id, zinssatz: zins, zinsHerkunft: herkunft, rate: null, zinsen: null, tilgung: null, restschuld: null, disagio: null, gebuehren: null, gesamtkosten: null, effektivzins: null, perioden: 0, luecken };
    if (!a.betrag || !zins || (a.tilgungsart !== "ENDFAELLIG" && !a.tilgungProzent)) return leer;

    const laufzeit = a.laufzeitMonate !== null ? Math.min(monate, a.laufzeitMonate) : monate;
    const plan = berechneTilgungsplan({
      saldo: a.betrag,
      ab: start,
      zinssatz: zins,
      zahlweise: a.zahlweise,
      tilgungsart: a.tilgungsart,
      tilgungProzent: a.tilgungProzent,
      bis: plusTage(plusMonate(start, laufzeit), -1),
      maxJahre: Math.ceil(laufzeit / 12) + 1,
    });
    const zinsen = plan.reduce((s, z) => s.plus(z.zins), NULL);
    const tilgung = plan.reduce((s, z) => s.plus(z.tilgung), NULL);
    const restschuld = a.betrag.minus(tilgung);
    const disagio = a.auszahlungProzent === null ? null : a.betrag.times(dezimal(100).minus(a.auszahlungProzent)).dividedBy(100).toDecimalPlaces(2);
    // Gebühren: unbekannte Gebühr bleibt unbekannt (nicht 0); sonstige Kosten nur, wenn angegeben
    const gebuehren = a.bearbeitungsgebuehr === null || disagio === null ? null : a.bearbeitungsgebuehr.plus(a.sonstigeKosten ?? NULL).plus(disagio);
    const vollstaendig = !luecken.includes("zinsbindungKuerzer");
    const gesamtkosten = vollstaendig && gebuehren !== null ? zinsen.plus(gebuehren) : null;

    let effektivzins: Decimal | null = null;
    if (vollstaendig && gebuehren !== null && plan.length > 0) {
      const zahlungen = plan.map((z) => z.rate);
      zahlungen[zahlungen.length - 1] = zahlungen[zahlungen.length - 1].plus(plan[plan.length - 1].restschuld);
      const r = internerZins(a.betrag.minus(gebuehren), zahlungen);
      const n = PERIODEN_PRO_JAHR[a.zahlweise];
      if (r) effektivzins = dezimal(1).plus(r).pow(n).minus(1).times(100).toDecimalPlaces(3);
    }
    return { ...leer, rate: plan[0]?.rate ?? null, zinsen, tilgung, restschuld, disagio, gebuehren, gesamtkosten, effektivzins, perioden: plan.length };
  });
}

/** Vorschlag für den Vergleichszeitraum: kürzeste Zinsbindung der Angebote (sonst 10 Jahre). */
export function vergleichsMonate(angebote: Pick<AngebotDaten, "zinsbindungMonate" | "laufzeitMonate">[]): number {
  const werte = angebote.map((a) => a.zinsbindungMonate ?? a.laufzeitMonate).filter((x): x is number => x !== null && x > 0);
  return werte.length ? Math.min(...werte) : 120;
}
