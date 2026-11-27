/**
 * KI-Vorschläge für Szenario- und Exit-Annahmen eines Hauses (reine Funktionen).
 *
 * Ablauf:
 * 1. `baueVorschlagPaket` stellt die Historie des Hauses als nummerierte Fakten (F…) und
 *    Datenlücken (L…) zusammen: Mietverträge und Neuvermietungsmieten je Jahr, Leerstandszeiten,
 *    Verkehrswerte und ihre jährliche Veränderung, Kredite mit Zinsbindung, Referenzzinsen,
 *    Investitionen und gespeicherte Exit-Rechnungen. Keine Personendaten.
 * 2. Die KI schlägt je Parameter einen Wert vor, begründet ihn und nennt die Fakten.
 * 3. `pruefeVorschlag` übernimmt nur Werte im erlaubten Format und Bereich mit mindestens einem
 *    gültigen Fakt als Beleg; alles andere bleibt unbekannt (keine Schätzung).
 * 4. Gerechnet wird nie durch die KI: Die Werte werden als Eingaben an die Exit-Kalkulation und
 *    das Szenario übergeben und dort im Code gerechnet.
 */
import { z } from "zod";
import { fuelle, type Texte } from "@/i18n";
import { istIsoDatum, monateZwischen, plusMonate, type IsoDatum } from "./datum";
import type { Formatierer } from "./format";
import { dezimal, type Decimal } from "./geld";
import type { Fakt, Luecke, Thema } from "./ki-analyse";
import { hausSummen, istAktiv, type HausDaten } from "./kennzahlen";
import { referenzzinsAm, restschuldNachweis, zinsbindung, zinssatz, type KreditDaten, type ReferenzWert } from "./kredit";
import { jahresNettokaltmiete } from "./miete";

export const VORSCHLAG_VERSION = 1;

export const EXIT_PARAMETER = ["verkaufsdatum", "preisBasis", "faktor", "maklerProzent", "sonstigeProzent", "vfeProzent"] as const;
export const SZENARIO_PARAMETER = ["mietsteigerung", "mietausfall", "leerVermietenMonate", "wertentwicklung", "zinsVariabelPP", "anschlusszins"] as const;
export const PARAMETER = [...EXIT_PARAMETER, ...SZENARIO_PARAMETER] as const;
export type Parameter = (typeof PARAMETER)[number];

/** Preisbasen, die die KI wählen darf (ein eigener Preis wäre eine Schätzung). */
export const VORSCHLAG_BASEN = ["miete", "marktwert", "gutachten"] as const;

type Regel = { art: "zahl"; min: number; max: number } | { art: "ganz"; min: number; max: number } | { art: "datum" } | { art: "basis" };

/** Format und erlaubter Bereich je Parameter. Werte außerhalb werden nicht übernommen. */
export const REGELN: Record<Parameter, Regel> = {
  verkaufsdatum: { art: "datum" },
  preisBasis: { art: "basis" },
  faktor: { art: "zahl", min: 1, max: 60 },
  maklerProzent: { art: "zahl", min: 0, max: 10 },
  sonstigeProzent: { art: "zahl", min: 0, max: 10 },
  vfeProzent: { art: "zahl", min: 0, max: 20 },
  mietsteigerung: { art: "zahl", min: -10, max: 15 },
  mietausfall: { art: "zahl", min: 0, max: 100 },
  leerVermietenMonate: { art: "ganz", min: 0, max: 120 },
  wertentwicklung: { art: "zahl", min: -15, max: 15 },
  zinsVariabelPP: { art: "zahl", min: -5, max: 10 },
  anschlusszins: { art: "zahl", min: 0, max: 15 },
};

/** Verkauf frühestens morgen, spätestens in zehn Jahren (Szenario-Horizont). */
export const MAX_JAHRE_VERKAUF = 10;

export interface VorschlagPaket {
  version: number;
  stichtag: IsoDatum;
  haus: { id: string; name: string; gesellschaftId: string; gesellschaft: string };
  fakten: Fakt[];
  luecken: Luecke[];
  /** Nur für die Beispielantwort ohne KI: im Code abgeleitete Werte mit ihren Fakten */
  demo: Partial<Record<Parameter, { wert: string; quellen: string[] }>>;
}

export interface VorschlagEingabe {
  stichtag: IsoDatum;
  haus: { id: string; name: string; gesellschaftId: string; gesellschaft: string; kaufpreis: Decimal | null; kaufdatum: IsoDatum | null };
  daten: HausDaten;
  einheiten: Array<{
    id: string;
    bezeichnung: string;
    art: "WOHNUNG" | "GEWERBE";
    flaeche: Decimal;
    erwarteteMiete: Decimal | null;
    vertraege: Array<{ beginn: IsoDatum; ende: IsoDatum | null; sollMiete: Decimal; istMiete: Decimal; letzteMieterhoehung: IsoDatum | null }>;
  }>;
  /** Verkehrswerte und Marktwerte, mit Rohertrag, wenn aus einem Gutachten */
  werte: Array<{ stichtag: IsoDatum; wert: Decimal; quelle: string | null; gutachten: { gutachter: string | null; rohertragJahr: Decimal | null } | null }>;
  kredite: Array<{ daten: KreditDaten; name: string }>;
  referenzwerte: ReferenzWert[];
  investitionen: Array<{ datum: IsoDatum; betrag: Decimal }>;
  exitrechnungen: Array<{ name: string; geaendertAm: IsoDatum; maklerProzent: Decimal; sonstigeProzent: Decimal; vfeProzent: Decimal | null; faktor: Decimal | null; preisBasis: string }>;
}

/** Anzahl der übertragenen Mietverträge (die jüngsten). */
const MAX_VERTRAEGE = 80;
/** Jahre Historie für Neuvermietungen, Referenzzinsen und Investitionen. */
const HISTORIE_JAHRE = 8;

const jahr = (d: IsoDatum) => Number(d.slice(0, 4));
const tageZwischen = (a: IsoDatum, b: IsoDatum) => (Date.parse(b) - Date.parse(a)) / 86_400_000;

/** Jährliche Veränderung in Prozent zwischen zwei Werten (geometrisch), null bei unter einem Jahr. */
export function jaehrlicheVeraenderung(von: { stichtag: IsoDatum; wert: Decimal }, bis: { stichtag: IsoDatum; wert: Decimal }): Decimal | null {
  const jahre = tageZwischen(von.stichtag, bis.stichtag) / 365.25;
  if (jahre < 1 || von.wert.lessThanOrEqualTo(0) || bis.wert.lessThanOrEqualTo(0)) return null;
  return bis.wert.dividedBy(von.wert).pow(dezimal(1).dividedBy(jahre)).minus(1).times(100);
}

export function baueVorschlagPaket(e: VorschlagEingabe, t: Texte, f: Formatierer): VorschlagPaket {
  const tf = t.kiVorschlag.fakt;
  const fakten: Fakt[] = [];
  const luecken: Luecke[] = [];
  const demo: VorschlagPaket["demo"] = {};
  const hausHref = `/haeuser/${e.haus.id}`;
  const fakt = (thema: Thema, name: string, wert: string, stichtag: string | null, quelle: string, href: string | null = hausHref, objekt = e.haus.name) => {
    const id = `F${fakten.length + 1}`;
    fakten.push({ id, thema, objekt, name, wert, stichtag, quelle, href });
    return id;
  };
  const luecke = (thema: Thema, text: string, href: string | null = hausHref, objekt = e.haus.name) => {
    const id = `L${luecken.length + 1}`;
    luecken.push({ id, thema, objekt, text, href });
    return id;
  };
  const s = e.stichtag;
  const stichtagText = f.datum(s);
  const prozent = (d: Decimal, stellen = 2) => f.prozent(d, stellen);
  const proQm = (miete: Decimal, flaeche: Decimal) => (flaeche.isZero() ? null : miete.dividedBy(flaeche));
  const qmText = (w: Decimal | null) => (w === null ? t.allgemein.unbekannt : `${f.faktor(w, 2)} €/m²`);

  // --- Stammdaten ------------------------------------------------------------------
  if (e.haus.kaufpreis) fakt("BEWERTUNG", tf.kaufpreis, f.betrag(e.haus.kaufpreis), e.haus.kaufdatum ? f.datum(e.haus.kaufdatum) : null, tf.quelleStammdaten);
  else luecke("BEWERTUNG", tf.kaufpreisFehlt);

  // --- Vermietung heute ------------------------------------------------------------
  const summen = hausSummen(e.daten, s);
  const flaeche = e.einheiten.reduce((x, y) => x.plus(y.flaeche), dezimal(0));
  const leer = e.einheiten.filter((u) => !u.vertraege.some((m) => istAktiv(m, s)));
  fakt("VERMIETUNG", tf.bestand, fuelle(tf.bestandWert, { einheiten: e.einheiten.length, flaeche: f.flaeche(flaeche), leer: leer.length }), stichtagText, tf.quelleStammdaten);
  const sollMonat = summen.sollMonat;
  fakt("VERMIETUNG", tf.sollMiete, fuelle(tf.mieteWert, { monat: f.betrag(sollMonat), jahr: f.betrag(jahresNettokaltmiete(sollMonat)) }), stichtagText, tf.quelleMietvertraege);
  const vermietet = e.einheiten.filter((u) => u.vertraege.some((m) => istAktiv(m, s)));
  const vermieteteFlaeche = vermietet.reduce((x, y) => x.plus(y.flaeche), dezimal(0));
  fakt("VERMIETUNG", tf.sollProQm, qmText(proQm(sollMonat, vermieteteFlaeche)), stichtagText, tf.quelleMietvertraege);
  if (!sollMonat.isZero()) {
    const quote = summen.istMonat.dividedBy(sollMonat).times(100);
    fakt("VERMIETUNG", tf.istQuote, fuelle(tf.istQuoteWert, { quote: prozent(quote, 1), ist: f.betrag(summen.istMonat), soll: f.betrag(sollMonat) }), stichtagText, tf.quelleMietvertraege);
  }
  if (summen.rueckstand.greaterThan(0)) fakt("VERMIETUNG", tf.rueckstand, f.betrag(summen.rueckstand), stichtagText, tf.quelleMietvertraege);
  for (const u of leer) {
    const letzte = [...u.vertraege].filter((m) => m.ende && m.ende < s).sort((a, b) => (a.ende! < b.ende! ? 1 : -1))[0];
    const seit = letzte?.ende ? fuelle(tf.leerSeit, { datum: f.datum(letzte.ende), monate: monateZwischen(letzte.ende, s) }) : tf.leerOhneVertrag;
    const erwartet = u.erwarteteMiete ? fuelle(tf.erwartet, { monat: f.betrag(u.erwarteteMiete), qm: qmText(proQm(u.erwarteteMiete, u.flaeche)) }) : tf.erwartetFehlt;
    fakt("VERMIETUNG", fuelle(tf.leereEinheit, { einheit: u.bezeichnung }), `${t.einheitArten[u.art]}, ${f.flaeche(u.flaeche)}; ${seit}; ${erwartet}`, stichtagText, tf.quelleMietvertraege);
    if (!u.erwarteteMiete) luecke("VERMIETUNG", fuelle(tf.erwarteteMieteFehlt, { einheit: u.bezeichnung }));
  }

  // --- Mietverträge (Historie) -----------------------------------------------------
  const alle = e.einheiten.flatMap((u) => u.vertraege.map((m) => ({ u, m })));
  alle.sort((a, b) => (a.m.beginn < b.m.beginn ? 1 : -1));
  for (const { u, m } of alle.slice(0, MAX_VERTRAEGE)) {
    const zeitraum = `${f.datum(m.beginn)} – ${m.ende ? f.datum(m.ende) : tf.laufend}`;
    const erhoehung = m.letzteMieterhoehung ? fuelle(tf.letzteErhoehung, { datum: f.datum(m.letzteMieterhoehung) }) : tf.keineErhoehung;
    fakt(
      "VERMIETUNG",
      fuelle(tf.vertrag, { einheit: u.bezeichnung }),
      fuelle(tf.vertragWert, { art: t.einheitArten[u.art], flaeche: f.flaeche(u.flaeche), soll: f.betrag(m.sollMiete), qm: qmText(proQm(m.sollMiete, u.flaeche)), erhoehung }),
      zeitraum,
      tf.quelleMietvertrag,
    );
  }
  if (alle.length > MAX_VERTRAEGE) luecke("VERMIETUNG", fuelle(tf.vertraegeGekuerzt, { anzahl: alle.length - MAX_VERTRAEGE }));
  if (alle.length === 0) luecke("VERMIETUNG", tf.keineVertraege);

  // Neuvermietungen: Ø Soll-Miete je m² der Verträge, die im jeweiligen Jahr begonnen haben
  const abJahr = jahr(s) - HISTORIE_JAHRE;
  const proJahr = new Map<number, { miete: Decimal; flaeche: Decimal; anzahl: number }>();
  for (const { u, m } of alle) {
    const j = jahr(m.beginn);
    if (j < abJahr || m.beginn > s || u.flaeche.isZero()) continue;
    const x = proJahr.get(j) ?? { miete: dezimal(0), flaeche: dezimal(0), anzahl: 0 };
    proJahr.set(j, { miete: x.miete.plus(m.sollMiete), flaeche: x.flaeche.plus(u.flaeche), anzahl: x.anzahl + 1 });
  }
  const neu = [...proJahr.entries()].sort((a, b) => a[0] - b[0]).map(([j, x]) => ({ jahr: j, qm: x.miete.dividedBy(x.flaeche), anzahl: x.anzahl, id: "" }));
  for (const n of neu) {
    n.id = fakt("VERMIETUNG", fuelle(tf.neuvermietung, { jahr: n.jahr }), fuelle(tf.neuvermietungWert, { qm: qmText(n.qm), anzahl: n.anzahl }), String(n.jahr), tf.quelleNeuvermietung);
  }
  if (neu.length < 2) luecke("VERMIETUNG", tf.neuvermietungZuWenig);
  else {
    const a = neu[0];
    const b = neu[neu.length - 1];
    const v = jaehrlicheVeraenderung({ stichtag: `${a.jahr}-07-01`, wert: a.qm }, { stichtag: `${b.jahr}-07-01`, wert: b.qm });
    if (v !== null) {
      const id = fakt("VERMIETUNG", fuelle(tf.neuvermietungTrend, { von: a.jahr, bis: b.jahr }), prozent(v, 1), `${a.jahr}–${b.jahr}`, tf.quelleBerechnetTrend);
      demo.mietsteigerung = { wert: v.toDecimalPlaces(1).toString(), quellen: [a.id, b.id, id] };
    }
  }

  // Leerstandszeiten zwischen zwei Verträgen derselben Einheit
  const luecken_monate: number[] = [];
  for (const u of e.einheiten) {
    const v = [...u.vertraege].sort((a, b) => (a.beginn < b.beginn ? -1 : 1));
    for (let i = 1; i < v.length; i++) {
      const ende = v[i - 1].ende;
      if (ende && ende < v[i].beginn) luecken_monate.push(Math.max(0, monateZwischen(ende, v[i].beginn)));
      else if (ende) luecken_monate.push(0);
    }
  }
  if (luecken_monate.length > 0) {
    const schnitt = luecken_monate.reduce((x, y) => x + y, 0) / luecken_monate.length;
    const id = fakt("VERMIETUNG", tf.wechsel, fuelle(tf.wechselWert, { anzahl: luecken_monate.length, schnitt: f.faktor(schnitt, 1), max: Math.max(...luecken_monate) }), null, tf.quelleBerechnetWechsel);
    demo.leerVermietenMonate = { wert: String(Math.round(schnitt)), quellen: [id] };
  } else luecke("VERMIETUNG", tf.keineWechsel);

  // --- Bewertung -------------------------------------------------------------------
  const werte = [...e.werte].filter((w) => w.stichtag <= s).sort((a, b) => (a.stichtag < b.stichtag ? -1 : 1));
  const wertIds = werte.map((w) =>
    fakt(
      "BEWERTUNG",
      w.gutachten ? tf.gutachten : tf.marktwert,
      f.betrag(w.wert),
      f.datum(w.stichtag),
      w.gutachten ? (w.gutachten.gutachter ? fuelle(tf.quelleGutachter, { gutachter: w.gutachten.gutachter }) : tf.quelleGutachten) : (w.quelle ?? tf.quelleUnbenannt),
    ),
  );
  if (werte.length === 0) luecke("BEWERTUNG", tf.keinWert);
  if (werte.length >= 2) {
    const a = werte[0];
    const b = werte[werte.length - 1];
    const v = jaehrlicheVeraenderung(a, b);
    if (v !== null) {
      const id = fakt("BEWERTUNG", tf.wertTrend, prozent(v, 1), `${f.datum(a.stichtag)} – ${f.datum(b.stichtag)}`, tf.quelleBerechnetWert);
      demo.wertentwicklung = { wert: v.toDecimalPlaces(1).toString(), quellen: [wertIds[0], wertIds[wertIds.length - 1], id] };
    }
  } else if (werte.length === 1) luecke("BEWERTUNG", tf.nurEinWert);
  if (e.haus.kaufpreis && e.haus.kaufdatum && werte.length > 0) {
    const b = werte[werte.length - 1];
    const v = jaehrlicheVeraenderung({ stichtag: e.haus.kaufdatum, wert: e.haus.kaufpreis }, b);
    if (v !== null) fakt("BEWERTUNG", tf.seitKauf, prozent(v, 1), `${f.datum(e.haus.kaufdatum)} – ${f.datum(b.stichtag)}`, tf.quelleBerechnetKauf);
  }
  const gutachten = werte.filter((w) => w.gutachten);
  const letztesGutachten = gutachten[gutachten.length - 1];
  if (!letztesGutachten) luecke("BEWERTUNG", tf.keinGutachten);
  else if (letztesGutachten.gutachten?.rohertragJahr && !letztesGutachten.gutachten.rohertragJahr.isZero()) {
    const faktor = letztesGutachten.wert.dividedBy(letztesGutachten.gutachten.rohertragJahr);
    const id = fakt(
      "BEWERTUNG",
      tf.rohertragsfaktor,
      fuelle(tf.rohertragsfaktorWert, { faktor: f.faktor(faktor, 2), rohertrag: f.betrag(letztesGutachten.gutachten.rohertragJahr) }),
      f.datum(letztesGutachten.stichtag),
      tf.quelleGutachten,
    );
    demo.preisBasis = { wert: "gutachten", quellen: [wertIds[werte.indexOf(letztesGutachten)], id] };
  } else luecke("BEWERTUNG", tf.keinRohertrag);
  if (!demo.preisBasis && werte.length > 0) demo.preisBasis = { wert: werte[werte.length - 1].gutachten ? "gutachten" : "marktwert", quellen: [wertIds[wertIds.length - 1]] };

  // Investitionen je Jahr
  const inv = new Map<number, Decimal>();
  for (const i of e.investitionen) if (i.datum <= s) inv.set(jahr(i.datum), (inv.get(jahr(i.datum)) ?? dezimal(0)).plus(i.betrag));
  for (const [j, b] of [...inv.entries()].sort((a, b) => a[0] - b[0]).filter(([j]) => j >= abJahr)) {
    fakt("BEWERTUNG", fuelle(tf.investition, { jahr: j }), f.betrag(b), String(j), tf.quelleInvestitionen);
  }

  // --- Finanzierung ----------------------------------------------------------------
  const kredite = e.kredite.filter((k) => k.daten.haeuser.some((h) => h.hausId === e.haus.id));
  if (kredite.length === 0) fakt("FINANZIERUNG", tf.keineKredite, tf.keineKrediteWert, stichtagText, tf.quelleStammdaten);
  let bindungsEnde: { datum: IsoDatum; id: string } | null = null;
  const referenzen = new Set<string>();
  for (const { daten: k, name } of kredite) {
    const href = `/gesellschaften/${k.gesellschaftId}/kredite/${k.id}`;
    const anteil = k.haeuser.find((h) => h.hausId === e.haus.id)!.anteilProzent;
    const satz = zinssatz(k, e.referenzwerte, s);
    const b = zinsbindung(k, s);
    const teile = [
      t.zinsArten[k.zinsArt],
      satz ? fuelle(tf.satz, { satz: prozent(satz) }) : tf.satzUnbekannt,
      k.zinsArt === "VARIABEL" && k.referenzzins ? fuelle(tf.referenz, { referenz: k.referenzzins, marge: k.marge ? prozent(k.marge) : t.allgemein.unbekannt }) : null,
      b.bis ? fuelle(tf.bindung, { datum: f.datum(b.bis) }) : null,
      k.laufzeitBis ? fuelle(tf.laufzeit, { datum: f.datum(k.laufzeitBis) }) : null,
      t.tilgungsarten[k.tilgungsart],
      fuelle(tf.anteil, { anteil: prozent(anteil, 0) }),
    ].filter(Boolean);
    const id = fakt("FINANZIERUNG", fuelle(tf.kredit, { kredit: name }), teile.join("; "), stichtagText, tf.quelleKreditvertrag, href, name);
    if (k.zinsArt === "FEST" && b.bis && b.bis > s && (!bindungsEnde || b.bis > bindungsEnde.datum)) bindungsEnde = { datum: b.bis, id };
    if (k.zinsArt === "VARIABEL" && k.referenzzins) referenzen.add(k.referenzzins);
    if (satz === null) luecke("FINANZIERUNG", tf.satzFehlt, href, name);
    const rest = restschuldNachweis(k, s);
    // Restschuld nur aus belegtem Saldo, nie aus Buchungssummen
    if (rest?.herkunft === "saldo") {
      const quelle = [rest.quelle ? t.saldoQuellen[rest.quelle] : null, rest.quelleText].filter(Boolean).join(", ") || tf.quelleUnbenannt;
      fakt("FINANZIERUNG", fuelle(tf.restschuld, { kredit: name }), fuelle(tf.restschuldWert, { gesamt: f.betrag(rest.betrag), anteil: f.betrag(rest.betrag.times(anteil).dividedBy(100)) }), f.datum(rest.stichtag), quelle, href, name);
    } else if (rest?.herkunft !== "nichtAusgezahlt") luecke("FINANZIERUNG", tf.restschuldFehlt, href, name);
    for (const x of k.sicherungen ?? []) {
      fakt("FINANZIERUNG", fuelle(tf.sicherung, { kredit: name }), fuelle(tf.sicherungWert, { art: x.art === "CAP" ? "Cap" : "Swap", satz: prozent(x.satz), ende: f.datum(x.ende) }), `${f.datum(x.beginn)} – ${f.datum(x.ende)}`, x.quelle ?? tf.quelleSicherung, href, name);
    }
    if (k.zinsArt === "FEST" && b.bis && b.bis > s) luecke("FINANZIERUNG", fuelle(tf.vfeFehlt, { datum: f.datum(b.bis) }), href, name);
  }
  if (bindungsEnde) {
    // Beispiel: Verkauf zum Ende der längsten Zinsbindung (keine Vorfälligkeitsentschädigung)
    const grenze = plusMonate(s, MAX_JAHRE_VERKAUF * 12);
    if (bindungsEnde.datum <= grenze) demo.verkaufsdatum = { wert: bindungsEnde.datum, quellen: [bindungsEnde.id] };
  }

  // Referenzzinsen: Stand zum Jahresende der letzten Jahre und heute
  for (const r of [...referenzen].sort()) {
    const punkte: string[] = [];
    for (let j = abJahr; j < jahr(s); j++) {
      const w = referenzzinsAm(e.referenzwerte, r, `${j}-12-31`);
      if (w && jahr(w.stichtag) === j) punkte.push(`${j}: ${prozent(w.satz)}`);
    }
    const jetzt = referenzzinsAm(e.referenzwerte, r, s);
    if (jetzt) punkte.push(fuelle(tf.referenzHeute, { satz: prozent(jetzt.satz), datum: f.datum(jetzt.stichtag) }));
    if (punkte.length > 0) fakt("FINANZIERUNG", fuelle(tf.referenzVerlauf, { referenz: r }), punkte.join("; "), null, tf.quelleReferenz, "/gesellschaften/referenzzinsen", r);
    else luecke("FINANZIERUNG", fuelle(tf.referenzFehlt, { referenz: r }), "/gesellschaften/referenzzinsen", r);
  }

  // --- Gespeicherte Exit-Rechnungen (eigene frühere Annahmen) -------------------------
  if (e.exitrechnungen.length === 0) luecke("SONSTIGES", tf.keineExitrechnung);
  for (const r of e.exitrechnungen) {
    const id = fakt(
      "SONSTIGES",
      fuelle(tf.exitrechnung, { name: r.name }),
      fuelle(tf.exitrechnungWert, {
        makler: prozent(r.maklerProzent),
        sonstige: prozent(r.sonstigeProzent),
        vfe: r.vfeProzent ? prozent(r.vfeProzent) : t.allgemein.unbekannt,
        basis: t.exit.basen[r.preisBasis as keyof typeof t.exit.basen] ?? r.preisBasis,
      }),
      f.datum(r.geaendertAm),
      tf.quelleExitrechnung,
      `/exit?h=${e.haus.id}`,
    );
    if (!demo.maklerProzent) {
      demo.maklerProzent = { wert: r.maklerProzent.toString(), quellen: [id] };
      demo.sonstigeProzent = { wert: r.sonstigeProzent.toString(), quellen: [id] };
    }
  }

  return { version: VORSCHLAG_VERSION, stichtag: s, haus: { id: e.haus.id, name: e.haus.name, gesellschaftId: e.haus.gesellschaftId, gesellschaft: e.haus.gesellschaft }, fakten, luecken, demo };
}

/** Datenpaket als Text für die KI: eine Zeile je Fakt und je Lücke. */
export function vorschlagPaketAlsText(p: VorschlagPaket, t: Texte): string {
  const tp = t.kiVorschlag.paket;
  return [
    fuelle(tp.kopf, { haus: p.haus.name, gesellschaft: p.haus.gesellschaft, stichtag: p.stichtag }),
    "",
    tp.fakten,
    ...p.fakten.map((x) => `[${x.id}] ${x.thema} · ${x.objekt} · ${x.name}: ${x.wert} · ${tp.stichtag} ${x.stichtag ?? tp.ohne} · ${tp.quelle} ${x.quelle}`),
    "",
    tp.luecken,
    ...(p.luecken.length === 0 ? [tp.keine] : p.luecken.map((x) => `[${x.id}] ${x.thema} · ${x.objekt}: ${x.text}`)),
    "",
    fuelle(tp.auftrag, { heute: p.stichtag, bis: plusMonate(p.stichtag, MAX_JAHRE_VERKAUF * 12) }),
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Antwort der KI
// ---------------------------------------------------------------------------

/** JSON-Schema für strukturierte Ausgaben (alle Felder Pflicht, keine Zusatzfelder). */
export const VORSCHLAG_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["zusammenfassung", "werte", "datenluecken"],
  properties: {
    zusammenfassung: { type: "string" },
    werte: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["parameter", "wert", "begruendung", "quellen"],
        properties: {
          parameter: { type: "string", enum: [...PARAMETER] },
          wert: { type: "string" },
          begruendung: { type: "string" },
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
  zusammenfassung: z.string(),
  werte: z.array(z.object({ parameter: z.enum(PARAMETER), wert: z.string(), begruendung: z.string(), quellen: z.array(z.string()) })),
  datenluecken: z.array(z.object({ text: z.string(), quellen: z.array(z.string()) })),
});

/**
 * ok: übernommen. unbekannt: die KI gibt bewusst keinen Wert (Datenlücke). ohneBeleg: Wert ohne
 * gültigen Fakt, nicht übernommen. ungueltig: Format oder Bereich falsch, nicht übernommen.
 * fehlt: die KI hat den Parameter nicht beantwortet.
 */
export type WertStatus = "ok" | "unbekannt" | "ohneBeleg" | "ungueltig" | "fehlt";

export interface GepruefterWert {
  parameter: Parameter;
  /** übernommener Wert in Normalform ("2.5", "2028-12-31", "gutachten"); null = nicht übernommen */
  wert: string | null;
  /** Wert, wie ihn die KI geliefert hat */
  roh: string;
  begruendung: string;
  quellen: string[];
  unbekannt: string[];
  status: WertStatus;
}

export interface GepruefterVorschlag {
  zusammenfassung: string;
  werte: GepruefterWert[];
  datenluecken: Array<{ text: string; quellen: string[]; unbekannt: string[] }>;
  pruefung: { uebernommen: number; nichtUebernommen: number; unbekannteVerweise: number };
}

/** Wert in Normalform, wenn Format und Bereich stimmen; sonst null. */
export function normalisiere(parameter: Parameter, roh: string, heute: IsoDatum): string | null {
  const text = roh.trim().replace(/\s*%$/, "").replace(",", ".");
  const r = REGELN[parameter];
  switch (r.art) {
    case "datum":
      return istIsoDatum(text) && text > heute && text <= plusMonate(heute, MAX_JAHRE_VERKAUF * 12) ? text : null;
    case "basis":
      return (VORSCHLAG_BASEN as readonly string[]).includes(text.toLowerCase()) ? text.toLowerCase() : null;
    case "ganz": {
      if (!/^\d+$/.test(text)) return null;
      const n = Number(text);
      return n >= r.min && n <= r.max ? String(n) : null;
    }
    case "zahl": {
      if (!/^[+-]?\d+(\.\d+)?$/.test(text)) return null;
      const d = dezimal(text);
      return d.greaterThanOrEqualTo(r.min) && d.lessThanOrEqualTo(r.max) ? d.toString() : null;
    }
  }
}

/** Wirft einen Fehler, wenn die Antwort nicht dem Schema entspricht. */
export function pruefeVorschlag(roh: unknown, paket: VorschlagPaket): GepruefterVorschlag {
  const r = rohSchema.parse(roh);
  const gueltig = new Set([...paket.fakten.map((x) => x.id), ...paket.luecken.map((x) => x.id)]);
  let unbekannteVerweise = 0;
  const teile = (quellen: string[]) => {
    const sauber = [...new Set(quellen.map((q) => q.trim().replace(/^\[|\]$/g, "").toUpperCase()))].filter(Boolean);
    const unbekannt = sauber.filter((q) => !gueltig.has(q));
    unbekannteVerweise += unbekannt.length;
    return { quellen: sauber.filter((q) => gueltig.has(q)), unbekannt };
  };
  const werte = PARAMETER.map((parameter): GepruefterWert => {
    const w = r.werte.find((x) => x.parameter === parameter);
    if (!w) return { parameter, wert: null, roh: "", begruendung: "", quellen: [], unbekannt: [], status: "fehlt" };
    const q = teile(w.quellen);
    const basis = { parameter, roh: w.wert.trim(), begruendung: w.begruendung.trim(), ...q };
    if (!basis.roh) return { ...basis, wert: null, status: "unbekannt" };
    const wert = normalisiere(parameter, basis.roh, paket.stichtag);
    if (wert === null) return { ...basis, wert: null, status: "ungueltig" };
    if (!q.quellen.some((x) => x.startsWith("F"))) return { ...basis, wert: null, status: "ohneBeleg" };
    return { ...basis, wert, status: "ok" };
  });
  return {
    zusammenfassung: r.zusammenfassung.trim(),
    werte,
    datenluecken: r.datenluecken.map((l) => ({ text: l.text.trim(), ...teile(l.quellen) })),
    pruefung: {
      uebernommen: werte.filter((w) => w.status === "ok").length,
      nichtUebernommen: werte.filter((w) => w.status === "ohneBeleg" || w.status === "ungueltig").length,
      unbekannteVerweise,
    },
  };
}

/**
 * Beispielantwort ohne KI für die Entwicklung (kein API-Schlüssel): übernimmt die im Code
 * abgeleiteten Werte des Pakets, lässt alles andere als Datenlücke offen und enthält absichtlich
 * einen Wert ohne Beleg, damit die Prüfung im Browser sichtbar ist.
 */
export function demoVorschlag(paket: VorschlagPaket, t: Texte): GepruefterVorschlag {
  const td = t.kiVorschlag.demo;
  const werte = PARAMETER.map((parameter) => {
    const d = paket.demo[parameter];
    if (d) return { parameter, wert: d.wert, begruendung: td.begruendung[parameter] ?? td.abgeleitet, quellen: d.quellen };
    if (parameter === "zinsVariabelPP") return { parameter, wert: "0.5", begruendung: td.ohneBeleg, quellen: ["F999"] };
    return { parameter, wert: "", begruendung: td.luecke, quellen: [] };
  });
  return pruefeVorschlag(
    {
      zusammenfassung: fuelle(td.zusammenfassung, { fakten: paket.fakten.length, luecken: paket.luecken.length }),
      werte,
      datenluecken: paket.luecken.slice(0, 3).map((l) => ({ text: l.text, quellen: [l.id] })),
    },
    paket,
  );
}

/** Verkaufskosten im Szenario: Makler + sonstige; null, wenn einer der beiden Werte fehlt. */
export function verkaufskosten(werte: Partial<Record<Parameter, string | null>>): Decimal | null {
  const m = werte.maklerProzent;
  const s = werte.sonstigeProzent;
  return m && s ? dezimal(m).plus(dezimal(s)) : null;
}

/** Jahre im Szenario: bis einschließlich des Verkaufsjahres, sonst fünf (1 bis 10). */
export function szenarioJahre(heute: IsoDatum, verkaufsdatum: string | null): number {
  if (!verkaufsdatum) return 5;
  return Math.min(MAX_JAHRE_VERKAUF, Math.max(1, jahr(verkaufsdatum) - jahr(heute)));
}
