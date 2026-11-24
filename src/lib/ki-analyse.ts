/**
 * KI-Analyse (reine Funktionen): baut aus gespeicherten Daten ein Datenpaket mit nummerierten
 * Fakten (F1, F2 …) und Datenlücken (L1, L2 …) und prüft die Antwort der KI.
 *
 * Grundsätze:
 * - Die KI bekommt nur dieses Datenpaket, keine Personendaten (keine Mieter- oder Gesellschafternamen).
 * - Jede Zahl im Paket hat Stichtag und Quelle; fehlende Werte erscheinen als Lücke, nie als 0.
 * - Jede Aussage der KI muss auf Fakten verweisen. Unbekannte Verweise werden entfernt und
 *   Befunde, Einschätzungen und Empfehlungen ohne gültigen Beleg als „ohne Beleg“ markiert.
 */
import { z } from "zod";
import { fuelle, type Texte } from "@/i18n";
import type { IsoDatum } from "./datum";
import type { DokumentStatus } from "./dokumente";
import { finanzVerlauf, jahresKennzahlen, type JahresDaten } from "./finanzen";
import type { Formatierer } from "./format";
import type { Decimal } from "./geld";
import { covenantPuffer, type Folge } from "./covenant";
import { covenantKennzahlen, gruppenKennzahlen, hausKennzahlen, type HausDaten, type Vollstaendigkeit } from "./kennzahlen";
import { kapitaldienstJahr, restschuldNachweis, zinsbindung, zinssatz, type KreditDaten, type ReferenzWert } from "./kredit";

export const DATENPAKET_VERSION = 1;

export const THEMEN = ["VERMIETUNG", "FINANZIERUNG", "COVENANTS", "BEWERTUNG", "FINANZEN", "DOKUMENTE", "GESELLSCHAFTER", "SONSTIGES"] as const;
export type Thema = (typeof THEMEN)[number];
export const AUSSAGE_ARTEN = ["BEFUND", "EINSCHAETZUNG", "ANNAHME", "EMPFEHLUNG"] as const;
export type AussageArt = (typeof AUSSAGE_ARTEN)[number];

export interface Fakt {
  id: string;
  thema: Thema;
  objekt: string;
  name: string;
  wert: string;
  /** Stichtag oder Zeitraum des Werts (Text), null wenn zeitlos */
  stichtag: string | null;
  quelle: string;
  href: string | null;
}

export interface Luecke {
  id: string;
  thema: Thema;
  objekt: string;
  text: string;
  href: string | null;
}

export interface Datenpaket {
  version: number;
  stichtag: IsoDatum;
  gesellschaft: { id: string; name: string };
  fakten: Fakt[];
  luecken: Luecke[];
}

type CovenantEingabe = { kennzahl: string; vergleich: "HOECHSTENS" | "MINDESTENS" | null; schwellenwert: Decimal | null; folge?: Folge };

export interface AnalyseEingabe {
  stichtag: IsoDatum;
  gesellschaft: { id: string; name: string; rechtsform: string | null };
  haeuser: Array<{ daten: HausDaten; name: string; verkehrswertQuelle: string | null }>;
  kredite: Array<{ daten: KreditDaten; name: string; bank: string | null; covenants: CovenantEingabe[] }>;
  /** Alle sichtbaren Häuser und Kredite, für Covenants über Gesellschaftsgrenzen hinweg */
  alleHaeuser: HausDaten[];
  alleKredite: KreditDaten[];
  referenzwerte: ReferenzWert[];
  geschaeftsjahre: JahresDaten[];
  dokumente: Array<{ objekt: string; vorgabe: string; status: DokumentStatus; href: string }>;
  waterfall: { vorzugsrenditeProzent: Decimal | null; vertragQuelle: string | null; gesellschafter: number; ohneEinlage: number; einlagenOhneDatum: number; ohneGewinnanteil: number };
}

/** Anzahl der berücksichtigten Geschäftsjahre (die jüngsten). */
const FINANZ_JAHRE = 3;

export function baueDatenpaket(e: AnalyseEingabe, t: Texte, f: Formatierer): Datenpaket {
  const tf = t.ki.fakt;
  const fakten: Fakt[] = [];
  const luecken: Luecke[] = [];
  const fakt = (x: Omit<Fakt, "id">) => fakten.push({ id: `F${fakten.length + 1}`, ...x });
  const luecke = (x: Omit<Luecke, "id">) => luecken.push({ id: `L${luecken.length + 1}`, ...x });
  const stichtagText = f.datum(e.stichtag);
  const g = e.gesellschaft;
  const gHref = `/gesellschaften/${g.id}`;
  const spanne = (v: Vollstaendigkeit) => (v.von && v.bis ? (v.von === v.bis ? f.datum(v.von) : `${f.datum(v.von)} – ${f.datum(v.bis)}`) : stichtagText);
  const teilweise = (v: Vollstaendigkeit) => (v.fehlend > 0 ? ` ${fuelle(tf.unvollstaendig, { fehlend: v.fehlend, gesamt: v.bekannt + v.fehlend })}` : "");

  // --- Gesellschaft gesamt ----------------------------------------------------
  const eigeneHaeuser = e.haeuser.map((h) => h.daten);
  const eigeneKredite = e.kredite.map((k) => k.daten);
  const k = gruppenKennzahlen(eigeneHaeuser, eigeneKredite, e.referenzwerte, e.stichtag);
  const berechnet = tf.quelleBerechnet;

  fakt({
    thema: "VERMIETUNG", objekt: g.name, name: tf.bestand,
    wert: fuelle(tf.bestandWert, { haeuser: k.haeuser, einheiten: k.einheiten, flaeche: f.flaeche(k.flaeche) }),
    stichtag: stichtagText, quelle: tf.quelleStammdaten, href: gHref,
  });
  if (k.einheiten > 0) {
    fakt({
      thema: "VERMIETUNG", objekt: g.name, name: tf.leerstand,
      wert: fuelle(tf.leerstandWert, { quote: f.prozent(k.leerstandQuote, 1), leer: k.leereEinheiten, einheiten: k.einheiten, erwartet: f.betrag(k.erwartetLeerMonat) }),
      stichtag: stichtagText, quelle: tf.quelleMietverhaeltnisse, href: gHref,
    });
    fakt({
      thema: "VERMIETUNG", objekt: g.name, name: tf.sollMiete,
      wert: fuelle(tf.mieteWert, { monat: f.betrag(k.sollMonat), jahr: f.jahresmiete(k.sollMonat) }),
      stichtag: stichtagText, quelle: tf.quelleMietverhaeltnisse, href: gHref,
    });
    fakt({
      thema: "VERMIETUNG", objekt: g.name, name: tf.istMiete,
      wert: fuelle(tf.mieteWert, { monat: f.betrag(k.istMonat), jahr: f.jahresmiete(k.istMonat) }),
      stichtag: stichtagText, quelle: tf.quelleMietverhaeltnisse, href: gHref,
    });
    fakt({ thema: "VERMIETUNG", objekt: g.name, name: tf.rueckstand, wert: f.betrag(k.rueckstand), stichtag: stichtagText, quelle: tf.quelleMietverhaeltnisse, href: gHref });
  }
  if (k.luecken.verkehrswert.bekannt > 0) {
    fakt({
      thema: "BEWERTUNG", objekt: g.name, name: tf.verkehrswertSumme,
      wert: f.betrag(k.verkehrswert) + teilweise(k.luecken.verkehrswert),
      stichtag: spanne(k.luecken.verkehrswert), quelle: tf.quelleVerkehrswerte, href: gHref,
    });
  }
  if (k.luecken.restschuld.bekannt > 0) {
    fakt({
      thema: "FINANZIERUNG", objekt: g.name, name: tf.restschuldSumme,
      wert: f.betrag(k.restschuld) + teilweise(k.luecken.restschuld),
      stichtag: spanne(k.luecken.restschuld), quelle: tf.quelleSalden, href: gHref,
    });
  }
  if (k.luecken.kapitaldienst.bekannt > 0) {
    const geschaetzt = k.luecken.kapitaldienst.geschaetzt > 0 ? ` ${fuelle(tf.davonGeschaetzt, { anzahl: k.luecken.kapitaldienst.geschaetzt })}` : "";
    fakt({
      thema: "FINANZIERUNG", objekt: g.name, name: tf.kapitaldienst,
      wert: fuelle(tf.kapitaldienstWert, { summe: f.betrag(k.kapitaldienstJahr), zins: f.betrag(k.zinsenJahr), tilgung: f.betrag(k.tilgungJahr) }) + teilweise(k.luecken.kapitaldienst) + geschaetzt,
      stichtag: fuelle(tf.zwoelfMonate, { stichtag: stichtagText }), quelle: tf.quelleKapitaldienst, href: gHref,
    });
  }
  const kennzahl = (name: string, wert: Decimal | null, text: string, formel: string, unvollstaendig: Vollstaendigkeit[]) => {
    const hinweis = unvollstaendig.some((v) => v.fehlend > 0) ? ` ${tf.ausUnvollstaendigen}` : "";
    if (wert === null) luecke({ thema: "FINANZIERUNG", objekt: g.name, text: fuelle(tf.kennzahlUnbekannt, { name }), href: gHref });
    else fakt({ thema: "FINANZIERUNG", objekt: g.name, name, wert: text + hinweis, stichtag: stichtagText, quelle: `${berechnet}: ${formel}`, href: gHref });
  };
  if (eigeneKredite.length > 0) {
    kennzahl("LTV", k.ltv, f.prozent(k.ltv, 1), tf.formelLtv, [k.luecken.restschuld, k.luecken.verkehrswert]);
    kennzahl("DSCR", k.dscr, f.faktor(k.dscr), tf.formelDscr, [k.luecken.kapitaldienst]);
    kennzahl("ICR", k.icr, f.faktor(k.icr), tf.formelIcr, [k.luecken.kapitaldienst]);
  }

  // --- Häuser -------------------------------------------------------------------
  for (const h of e.haeuser) {
    const href = `/haeuser/${h.daten.id}`;
    const hk = hausKennzahlen(h.daten, [], e.referenzwerte, e.stichtag);
    const vw = letzterVerkehrswert(h.daten, e.stichtag);
    if (vw) {
      fakt({ thema: "BEWERTUNG", objekt: h.name, name: tf.verkehrswert, wert: f.betrag(vw.wert), stichtag: f.datum(vw.stichtag), quelle: h.verkehrswertQuelle ?? tf.quelleUnbenannt, href });
    } else {
      luecke({ thema: "BEWERTUNG", objekt: h.name, text: tf.verkehrswertFehlt, href });
    }
    if (h.daten.einheiten.length === 0) {
      luecke({ thema: "VERMIETUNG", objekt: h.name, text: tf.keineEinheiten, href });
      continue;
    }
    fakt({
      thema: "VERMIETUNG", objekt: h.name, name: tf.sollMiete,
      wert: fuelle(tf.mieteWert, { monat: f.betrag(hk.sollMonat), jahr: f.jahresmiete(hk.sollMonat) }),
      stichtag: stichtagText, quelle: tf.quelleMietverhaeltnisse, href,
    });
    fakt({
      thema: "VERMIETUNG", objekt: h.name, name: tf.leerstand,
      wert: fuelle(tf.leerstandWert, { quote: f.prozent(hk.leerstandQuote, 1), leer: hk.leereEinheiten, einheiten: hk.einheiten, erwartet: f.betrag(hk.erwartetLeerMonat) }),
      stichtag: stichtagText, quelle: tf.quelleMietverhaeltnisse, href,
    });
    if (hk.rueckstand.greaterThan(0)) {
      fakt({ thema: "VERMIETUNG", objekt: h.name, name: tf.rueckstand, wert: f.betrag(hk.rueckstand), stichtag: stichtagText, quelle: tf.quelleMietverhaeltnisse, href });
    }
    if (hk.luecken.erwarteteMiete.fehlend > 0) {
      luecke({ thema: "VERMIETUNG", objekt: h.name, text: fuelle(tf.erwarteteMieteFehlt, { anzahl: hk.luecken.erwarteteMiete.fehlend }), href });
    }
  }

  // --- Kredite ------------------------------------------------------------------
  for (const kr of e.kredite) {
    const d = kr.daten;
    const href = `/gesellschaften/kredite/${d.id}`;
    const objekt = kr.bank ? `${kr.name} (${kr.bank})` : kr.name;
    const rest = restschuldNachweis(d, e.stichtag);
    if (rest && rest.herkunft !== "nichtAusgezahlt") {
      const quelle = [rest.quelle ? t.saldoQuellen[rest.quelle] : null, rest.quelleText, rest.herkunft === "buchung" ? tf.quelleBuchung : null].filter(Boolean).join(", ");
      fakt({ thema: "FINANZIERUNG", objekt, name: tf.restschuld, wert: f.betrag(rest.betrag), stichtag: f.datum(rest.stichtag), quelle, href });
    } else if (!rest) {
      luecke({ thema: "FINANZIERUNG", objekt, text: tf.restschuldFehlt, href });
    }
    const satz = zinssatz(d, e.referenzwerte, e.stichtag);
    if (satz === null) luecke({ thema: "FINANZIERUNG", objekt, text: tf.zinssatzFehlt, href });
    else {
      const art = d.zinsArt === "FEST" ? t.zinsArten.FEST : `${t.zinsArten.VARIABEL}, ${d.referenzzins ?? ""} + ${f.prozent(d.marge)}`;
      fakt({ thema: "FINANZIERUNG", objekt, name: tf.zinssatz, wert: `${f.prozent(satz)} (${art})`, stichtag: stichtagText, quelle: tf.quelleKreditvertrag, href });
    }
    const zb = zinsbindung(d, e.stichtag);
    if (zb.bis) {
      fakt({ thema: "FINANZIERUNG", objekt, name: tf.zinsbindung, wert: fuelle(tf.zinsbindungWert, { bis: f.datum(zb.bis), monate: zb.monate ?? 0 }), stichtag: stichtagText, quelle: tf.quelleKreditvertrag, href });
    }
    if (d.laufzeitBis) fakt({ thema: "FINANZIERUNG", objekt, name: tf.laufzeit, wert: f.datum(d.laufzeitBis), stichtag: null, quelle: tf.quelleKreditvertrag, href });
    const kd = kapitaldienstJahr(d, e.referenzwerte, e.stichtag);
    if (kd) {
      fakt({
        thema: "FINANZIERUNG", objekt, name: tf.kapitaldienst,
        wert: fuelle(tf.kapitaldienstWert, { summe: f.betrag(kd.summe), zins: f.betrag(kd.zins), tilgung: f.betrag(kd.tilgung) }),
        stichtag: kd.von && kd.bis ? `${f.datum(kd.von)} – ${f.datum(kd.bis)}` : stichtagText,
        quelle: kd.quelle === "buchungen" ? tf.quelleBuchungen : tf.quelleHochrechnung,
        href,
      });
    } else {
      luecke({ thema: "FINANZIERUNG", objekt, text: tf.kapitaldienstFehlt, href });
    }

    if (kr.covenants.length > 0) {
      const werte = covenantKennzahlen(d, e.alleHaeuser, e.alleKredite, e.referenzwerte, e.stichtag);
      for (const c of kr.covenants) {
        const name = `${c.folge === "AUSSCHUETTUNGSSPERRE" ? tf.sperre : tf.covenant} ${c.kennzahl.trim().toUpperCase()} ${c.vergleich ? t.vergleiche[c.vergleich] : ""} ${c.schwellenwert ? c.schwellenwert.toFixed() : ""}`.replace(/\s+/g, " ").trim();
        const p = covenantPuffer(c, werte);
        if (!p) {
          luecke({ thema: "COVENANTS", objekt, text: fuelle(tf.covenantNichtPruefbar, { name }), href });
          continue;
        }
        const einheit = c.kennzahl.trim().toUpperCase() === "LTV" ? " %" : "";
        fakt({
          thema: "COVENANTS", objekt, name,
          wert: fuelle(p.eingehalten ? tf.covenantEingehalten : tf.covenantVerletzt, {
            wert: `${f.faktor(p.wert)}${einheit}`,
            abstand: `${f.faktor(p.abstand)}${einheit}`,
            relativ: f.prozent(p.abstandRelativ, 1),
          }),
          stichtag: stichtagText, quelle: tf.quelleCovenant, href,
        });
      }
    }
  }

  // --- Geschäftsjahre -----------------------------------------------------------
  const verlauf = finanzVerlauf(e.geschaeftsjahre);
  const finanzHref = `${gHref}/finanzen`;
  if (verlauf.length === 0) {
    luecke({ thema: "FINANZEN", objekt: g.name, text: tf.keineAbschluesse, href: finanzHref });
  }
  for (const spalte of verlauf.slice(-FINANZ_JAHRE)) {
    if (!spalte.daten) {
      luecke({ thema: "FINANZEN", objekt: g.name, text: fuelle(tf.jahrFehlt, { jahr: spalte.jahr }), href: finanzHref });
      continue;
    }
    const j = spalte.daten;
    const vorjahr = e.geschaeftsjahre.find((x) => x.jahr === j.jahr - 1) ?? null;
    const jk = jahresKennzahlen(j, vorjahr);
    const quelle = `${t.abschlussQuellen[j.quelle]} ${j.jahr}${j.status === "ENTWURF" ? ` (${t.abschlussStatus.ENTWURF})` : ""}${j.quelleText ? `, ${j.quelleText}` : ""}`;
    const zeitraum = `${f.datum(j.beginn)} – ${f.datum(j.ende)}`;
    const fehlend: string[] = [];
    const posten = (name: string, wert: Decimal | null, text: (w: Decimal) => string) => {
      if (wert === null) fehlend.push(name);
      else fakt({ thema: "FINANZEN", objekt: g.name, name: `${name} ${j.jahr}`, wert: text(wert), stichtag: zeitraum, quelle, href: `${finanzHref}/${j.id}` });
    };
    posten(tf.umsatz, j.umsatzerloese, f.betrag);
    posten("EBITDA", jk.ebitda, f.betrag);
    posten(tf.jahresergebnis, j.jahresergebnis, f.betrag);
    posten(tf.eigenkapitalquote, jk.eigenkapitalquote, (w) => f.prozent(w, 1));
    posten(tf.nettoverschuldung, jk.nettoverschuldung, f.betrag);
    posten(tf.liquideMittel, j.liquideMittel, f.betrag);
    if (fehlend.length > 0) {
      luecke({ thema: "FINANZEN", objekt: g.name, text: fuelle(tf.postenFehlen, { jahr: j.jahr, posten: fehlend.join(", ") }), href: `${finanzHref}/${j.id}` });
    }
  }

  // --- Dokumente ----------------------------------------------------------------
  const offen = e.dokumente.filter((d) => d.status === "fehlt" || d.status === "veraltet" || d.status === "datumFehlt");
  if (e.dokumente.length > 0) {
    fakt({
      thema: "DOKUMENTE", objekt: g.name, name: tf.dokumente,
      wert: fuelle(tf.dokumenteWert, { offen: offen.length, gesamt: e.dokumente.filter((d) => d.status !== "nichtErforderlich").length }),
      stichtag: stichtagText, quelle: tf.quelleCheckliste, href: `/dokumente/gesellschaft/${g.id}`,
    });
  }
  for (const d of offen) {
    luecke({ thema: "DOKUMENTE", objekt: d.objekt, text: `${d.vorgabe}: ${t.dokumente.statusArten[d.status]}`, href: d.href });
  }

  // --- Gesellschafter und Vertragsregeln ---------------------------------------
  const w = e.waterfall;
  const wHref = `${gHref}/gesellschafter`;
  if (w.gesellschafter === 0) luecke({ thema: "GESELLSCHAFTER", objekt: g.name, text: tf.keineGesellschafter, href: wHref });
  else fakt({ thema: "GESELLSCHAFTER", objekt: g.name, name: tf.gesellschafter, wert: String(w.gesellschafter), stichtag: null, quelle: tf.quelleStammdaten, href: wHref });
  if (w.vorzugsrenditeProzent === null) luecke({ thema: "GESELLSCHAFTER", objekt: g.name, text: tf.vertragFehlt, href: wHref });
  else fakt({ thema: "GESELLSCHAFTER", objekt: g.name, name: tf.vorzugsrendite, wert: f.prozent(w.vorzugsrenditeProzent), stichtag: null, quelle: w.vertragQuelle ?? tf.quelleUnbenannt, href: wHref });
  if (w.ohneEinlage > 0) luecke({ thema: "GESELLSCHAFTER", objekt: g.name, text: fuelle(tf.ohneEinlage, { anzahl: w.ohneEinlage }), href: wHref });
  if (w.einlagenOhneDatum > 0) luecke({ thema: "GESELLSCHAFTER", objekt: g.name, text: fuelle(tf.einlagenOhneDatum, { anzahl: w.einlagenOhneDatum }), href: wHref });
  if (w.ohneGewinnanteil > 0) luecke({ thema: "GESELLSCHAFTER", objekt: g.name, text: fuelle(tf.ohneGewinnanteil, { anzahl: w.ohneGewinnanteil }), href: wHref });

  return { version: DATENPAKET_VERSION, stichtag: e.stichtag, gesellschaft: { id: g.id, name: g.name }, fakten, luecken };
}

function letzterVerkehrswert(h: HausDaten, stichtag: IsoDatum) {
  let best: HausDaten["verkehrswerte"][number] | null = null;
  for (const v of h.verkehrswerte) if (v.stichtag <= stichtag && (!best || v.stichtag > best.stichtag)) best = v;
  return best;
}

/** Datenpaket als Text für die KI: eine Zeile je Fakt und je Lücke. */
export function datenpaketAlsText(p: Datenpaket, t: Texte): string {
  const tp = t.ki.paket;
  const zeilen = [
    fuelle(tp.kopf, { gesellschaft: p.gesellschaft.name, stichtag: p.stichtag }),
    "",
    tp.fakten,
    ...p.fakten.map((x) => `[${x.id}] ${x.thema} · ${x.objekt} · ${x.name}: ${x.wert} · ${tp.stichtag} ${x.stichtag ?? tp.ohne} · ${tp.quelle} ${x.quelle}`),
    "",
    tp.luecken,
    ...(p.luecken.length === 0 ? [tp.keine] : p.luecken.map((x) => `[${x.id}] ${x.thema} · ${x.objekt}: ${x.text}`)),
  ];
  return zeilen.join("\n");
}

// ---------------------------------------------------------------------------
// Antwort der KI
// ---------------------------------------------------------------------------

/** JSON-Schema für strukturierte Ausgaben (alle Felder Pflicht, keine Zusatzfelder). */
export const ERGEBNIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["zusammenfassung", "aussagen", "datenluecken"],
  properties: {
    zusammenfassung: {
      type: "object",
      additionalProperties: false,
      required: ["text", "quellen"],
      properties: { text: { type: "string" }, quellen: { type: "array", items: { type: "string" } } },
    },
    aussagen: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["thema", "art", "text", "quellen"],
        properties: {
          thema: { type: "string", enum: [...THEMEN] },
          art: { type: "string", enum: [...AUSSAGE_ARTEN] },
          text: { type: "string" },
          quellen: { type: "array", items: { type: "string" } },
        },
      },
    },
    datenluecken: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "quellen"],
        properties: { text: { type: "string" }, quellen: { type: "array", items: { type: "string" } } },
      },
    },
  },
} as const;

const rohSchema = z.object({
  zusammenfassung: z.object({ text: z.string(), quellen: z.array(z.string()) }),
  aussagen: z.array(z.object({ thema: z.enum(THEMEN), art: z.enum(AUSSAGE_ARTEN), text: z.string(), quellen: z.array(z.string()) })),
  datenluecken: z.array(z.object({ text: z.string(), quellen: z.array(z.string()) })),
});
export type RohErgebnis = z.infer<typeof rohSchema>;

export interface GepruefteAussage {
  thema: Thema;
  art: AussageArt;
  text: string;
  /** gültige Verweise auf Fakten (F…) oder Lücken (L…) */
  quellen: string[];
  /** Verweise, die es im Datenpaket nicht gibt (entfernt) */
  unbekannt: string[];
  /** Befund, Einschätzung oder Empfehlung ohne gültigen Fakt als Beleg */
  ohneBeleg: boolean;
}

export interface GeprueftesErgebnis {
  zusammenfassung: { text: string; quellen: string[]; unbekannt: string[] };
  aussagen: GepruefteAussage[];
  datenluecken: Array<{ text: string; quellen: string[]; unbekannt: string[] }>;
  /** Zahl der Aussagen ohne Beleg und der entfernten Verweise, für den Hinweis oben */
  pruefung: { ohneBeleg: number; unbekannteVerweise: number };
}

/** Wirft einen Fehler, wenn die Antwort nicht dem Schema entspricht. */
export function pruefeErgebnis(roh: unknown, paket: Datenpaket): GeprueftesErgebnis {
  const r = rohSchema.parse(roh);
  const gueltig = new Set([...paket.fakten.map((x) => x.id), ...paket.luecken.map((x) => x.id)]);
  let unbekannteVerweise = 0;
  const teile = (quellen: string[]) => {
    const sauber = [...new Set(quellen.map((q) => q.trim().replace(/^\[|\]$/g, "").toUpperCase()))];
    const unbekannt = sauber.filter((q) => !gueltig.has(q));
    unbekannteVerweise += unbekannt.length;
    return { quellen: sauber.filter((q) => gueltig.has(q)), unbekannt };
  };
  const aussagen = r.aussagen.map((a): GepruefteAussage => {
    const q = teile(a.quellen);
    const hatFakt = q.quellen.some((x) => x.startsWith("F"));
    return { thema: a.thema, art: a.art, text: a.text.trim(), ...q, ohneBeleg: a.art !== "ANNAHME" && !hatFakt };
  });
  return {
    zusammenfassung: { text: r.zusammenfassung.text.trim(), ...teile(r.zusammenfassung.quellen) },
    aussagen,
    datenluecken: r.datenluecken.map((l) => ({ text: l.text.trim(), ...teile(l.quellen) })),
    pruefung: { ohneBeleg: aussagen.filter((a) => a.ohneBeleg).length, unbekannteVerweise },
  };
}

/**
 * Beispielantwort ohne KI für die Entwicklung (kein API-Schlüssel, nicht in Produktion):
 * gibt Fakten des Datenpakets wörtlich als Befunde wieder und enthält absichtlich eine Annahme
 * und einen ungültigen Verweis, damit Kennzeichnung und Prüfung im Browser sichtbar sind.
 */
export function demoErgebnis(paket: Datenpaket, t: Texte): GeprueftesErgebnis {
  const td = t.ki.demo;
  const wichtig = paket.fakten.filter((x) => x.objekt === paket.gesellschaft.name || x.thema === "COVENANTS").slice(0, 8);
  const roh: RohErgebnis = {
    zusammenfassung: { text: fuelle(td.zusammenfassung, { fakten: paket.fakten.length, luecken: paket.luecken.length }), quellen: wichtig.slice(0, 1).map((x) => x.id) },
    aussagen: [
      ...wichtig.map((x) => ({
        thema: x.thema,
        art: "BEFUND" as const,
        text: fuelle(td.befund, { objekt: x.objekt, name: x.name, wert: x.wert, stichtag: x.stichtag ?? "–" }),
        quellen: [x.id],
      })),
      { thema: "SONSTIGES", art: "ANNAHME", text: td.annahme, quellen: [] },
      { thema: "SONSTIGES", art: "EMPFEHLUNG", text: td.ungueltig, quellen: ["F9999"] },
    ],
    datenluecken: paket.luecken.slice(0, 5).map((l) => ({ text: `${l.objekt}: ${l.text}`, quellen: [l.id] })),
  };
  return pruefeErgebnis(roh, paket);
}
