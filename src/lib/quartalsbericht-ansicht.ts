/**
 * Aufbereitung eines eingefrorenen Quartalsberichts in Abschnitte mit Tabellen. Dieselbe Aufbereitung
 * dient der Ansicht im Browser und dem PDF, damit beide genau dieselben Zahlen zeigen.
 */
import { fuelle, type Texte } from "@/i18n";
import type { Formatierer } from "./format";
import { dezimal } from "./geld";
import { veraenderung, type KennzahlStand, type QuartalsberichtInhalt } from "./quartalsbericht";

export type Ton = "gut" | "schlecht" | "warnung";
export type Zelle = { text: string; ton?: Ton; fett?: boolean };
export type Abschnitt = {
  titel: string;
  spalten?: Array<{ titel: string; breite: number; rechts?: boolean }>;
  zeilen?: Zelle[][];
  texte?: Array<{ text: string; ton?: Ton }>;
};

export function berichtAbschnitte(b: QuartalsberichtInhalt, t: Texte, f: Formatierer, kommentar: string | null): Abschnitt[] {
  const tq = t.quartalsbericht;
  const u = tq.unbekannt;
  const geld = (x: string | null) => (x === null ? u : f.betragGanz(dezimal(x)));
  const prozent = (x: string | null) => (x === null ? u : f.prozent(dezimal(x), 1));
  const faktor = (x: string | null) => (x === null ? u : f.faktor(dezimal(x), 2));
  const z = (text: string, extra: Partial<Zelle> = {}): Zelle => ({ text, ...extra });

  const vergleich = (art: "geld" | "prozent" | "faktor", jetzt: string | null, vorher: string | null) => {
    const d = veraenderung(jetzt, vorher);
    if (d === null) return "–";
    const vorzeichen = d.isPositive() && !d.isZero() ? "+" : "";
    return art === "geld" ? `${vorzeichen}${f.betragGanz(d)}` : art === "prozent" ? `${vorzeichen}${f.zahl(d, 1)} %-P.` : `${vorzeichen}${f.zahl(d, 2)}`;
  };
  const a = b.aktuell;
  const v = b.vorquartal;
  const kzZeile = (titel: string, art: "geld" | "prozent" | "faktor", feld: keyof Pick<KennzahlStand, "verkehrswert" | "restschuld" | "sollJahr" | "istJahr" | "kapitaldienstJahr" | "ltv" | "dscr" | "icr" | "leerstandQuote">) => {
    const fmt = art === "geld" ? geld : art === "prozent" ? prozent : faktor;
    return [z(titel), z(fmt(a[feld])), z(fmt(v[feld])), z(vergleich(art, a[feld], v[feld]))];
  };

  const luecken: Array<{ text: string; ton?: Ton }> = [];
  for (const [art, l] of [
    [tq.kz.verkehrswert, a.luecken.verkehrswert],
    [tq.kz.restschuld, a.luecken.restschuld],
    [tq.kz.kapitaldienstJahr, a.luecken.kapitaldienst],
  ] as const) {
    const gesamt = l.bekannt + l.fehlend;
    if (gesamt === 0) continue;
    let text = fuelle(tq.lueckeText, { art, bekannt: l.bekannt, gesamt });
    if (l.von && l.bis) text += ` · ${fuelle(tq.lueckeStichtage, { von: f.datum(l.von), bis: f.datum(l.bis) })}`;
    luecken.push({ text, ton: l.fehlend > 0 ? "schlecht" : undefined });
  }
  if (a.luecken.kapitaldienst.geschaetzt > 0) luecken.push({ text: fuelle(tq.geschaetzt, { anzahl: a.luecken.kapitaldienst.geschaetzt }), ton: "warnung" });

  const covenantTon = (s: "frei" | "aktiv" | "manuell"): Ton => (s === "frei" ? "gut" : s === "aktiv" ? "schlecht" : "warnung");
  const istLtv = (k: string) => k.trim().toUpperCase() === "LTV";

  return [
    {
      titel: tq.abschnitte.kennzahlen,
      spalten: [
        { titel: tq.spaltenKz.kennzahl, breite: 3 },
        { titel: fuelle(tq.spaltenKz.aktuell, { quartal: b.quartal, jahr: b.jahr }), breite: 2, rechts: true },
        { titel: `${tq.spaltenKz.vorquartal} (${f.datum(v.stichtag)})`, breite: 2, rechts: true },
        { titel: tq.spaltenKz.veraenderung, breite: 2, rechts: true },
      ],
      zeilen: [
        [z(tq.kz.haeuser), z(String(a.haeuser)), z(String(v.haeuser)), z(String(a.haeuser - v.haeuser))],
        [z(tq.kz.einheiten), z(`${a.einheiten} (${a.leereEinheiten})`), z(`${v.einheiten} (${v.leereEinheiten})`), z("–")],
        kzZeile(tq.kz.verkehrswert, "geld", "verkehrswert"),
        kzZeile(tq.kz.restschuld, "geld", "restschuld"),
        kzZeile(tq.kz.sollJahr, "geld", "sollJahr"),
        kzZeile(tq.kz.istJahr, "geld", "istJahr"),
        kzZeile(tq.kz.kapitaldienstJahr, "geld", "kapitaldienstJahr"),
        kzZeile(tq.kz.ltv, "prozent", "ltv"),
        kzZeile(tq.kz.dscr, "faktor", "dscr"),
        kzZeile(tq.kz.icr, "faktor", "icr"),
        kzZeile(tq.kz.leerstandQuote, "prozent", "leerstandQuote"),
      ],
    },
    {
      titel: tq.abschnitte.haeuser,
      spalten: [
        { titel: tq.spaltenHaus.name, breite: 3 },
        { titel: tq.spaltenHaus.verkehrswert, breite: 2, rechts: true },
        { titel: tq.spaltenHaus.stand, breite: 1.4 },
        { titel: tq.spaltenHaus.sollJahr, breite: 1.8, rechts: true },
        { titel: tq.spaltenHaus.istJahr, breite: 1.8, rechts: true },
        { titel: tq.spaltenHaus.leerstand, breite: 1.3, rechts: true },
        { titel: tq.spaltenHaus.ltv, breite: 1.2, rechts: true },
      ],
      zeilen: b.haeuser.map((h) => [
        z(h.name),
        z(h.verkehrswert ? geld(h.verkehrswert.wert) : u, { ton: h.verkehrswert ? undefined : "schlecht" }),
        z(h.verkehrswert ? f.datum(h.verkehrswert.stichtag) : "–"),
        z(geld(h.sollJahr)),
        z(geld(h.istJahr)),
        z(prozent(h.leerstandQuote)),
        z(prozent(h.ltv)),
      ]),
    },
    {
      titel: tq.abschnitte.kredite,
      spalten: [
        { titel: tq.spaltenKredit.name, breite: 3 },
        { titel: tq.spaltenKredit.bank, breite: 2.2 },
        { titel: tq.spaltenKredit.restschuld, breite: 1.9, rechts: true },
        { titel: tq.spaltenKredit.stand, breite: 1.4 },
        { titel: tq.spaltenKredit.zinssatz, breite: 1.2, rechts: true },
        { titel: tq.spaltenKredit.zinsbindung, breite: 1.5 },
        { titel: tq.spaltenKredit.laufzeit, breite: 1.4 },
      ],
      zeilen: b.kredite.map((k) => [
        z(k.name),
        z(k.bank ?? "–"),
        z(k.restschuld ? geld(k.restschuld.betrag) : u, { ton: k.restschuld ? undefined : "schlecht" }),
        z(k.restschuld ? f.datum(k.restschuld.stichtag) : "–"),
        z(k.zinssatz === null ? u : f.prozent(dezimal(k.zinssatz), 2)),
        z(k.zinsbindungBis ? f.datum(k.zinsbindungBis) : "–"),
        z(k.laufzeitBis ? f.datum(k.laufzeitBis) : "–"),
      ]),
    },
    b.covenants.length === 0
      ? { titel: tq.abschnitte.covenants, texte: [{ text: tq.keineCovenants }] }
      : {
          titel: tq.abschnitte.covenants,
          spalten: [
            { titel: tq.spaltenCovenant.kredit, breite: 3 },
            { titel: tq.spaltenCovenant.kennzahl, breite: 1.6 },
            { titel: tq.spaltenCovenant.art, breite: 2 },
            { titel: tq.spaltenCovenant.bedingung, breite: 2 },
            { titel: tq.spaltenCovenant.wert, breite: 1.3, rechts: true },
            { titel: tq.spaltenCovenant.status, breite: 1.5 },
          ],
          zeilen: b.covenants.map((c) => [
            z(c.kredit),
            z(c.kennzahl),
            z(t.kredite.folgen[c.folge]),
            z(c.vergleich && c.schwellenwert !== null ? `${t.vergleiche[c.vergleich]} ${istLtv(c.kennzahl) ? prozent(c.schwellenwert) : faktor(c.schwellenwert)}` : "–"),
            z(c.wert === null ? (c.vergleich ? u : "–") : istLtv(c.kennzahl) ? prozent(c.wert) : faktor(c.wert)),
            z(tq.covenantStatus[c.status], { ton: covenantTon(c.status), fett: true }),
          ]),
        },
    {
      titel: tq.abschnitte.liquiditaet,
      spalten: [
        { titel: tq.spaltenKonto.gesellschaft, breite: 3 },
        { titel: tq.spaltenKonto.konto, breite: 2.5 },
        { titel: tq.spaltenKonto.betrag, breite: 2, rechts: true },
        { titel: tq.spaltenKonto.stand, breite: 1.4 },
      ],
      zeilen: [
        ...b.liquiditaet.konten.map((k) => [z(k.gesellschaft), z(k.konto), z(geld(k.betrag)), z(f.datum(k.stichtag))]),
        [z(tq.summeKonten, { fett: true }), z(""), z(geld(b.liquiditaet.summe), { fett: true, ton: b.liquiditaet.summe === null ? "schlecht" : undefined }), z("")],
      ],
      texte: b.liquiditaet.ohneKontostand.length > 0 ? [{ text: fuelle(tq.ohneKontostand, { namen: b.liquiditaet.ohneKontostand.join(", ") }), ton: "schlecht" }] : undefined,
    },
    b.fristen.length === 0
      ? { titel: tq.abschnitte.fristen, texte: [{ text: tq.keineFristen }] }
      : {
          titel: tq.abschnitte.fristen,
          spalten: [
            { titel: t.allgemein.datum, breite: 1.4 },
            { titel: tq.spaltenCovenant.art, breite: 2.2 },
            { titel: tq.spaltenKredit.name, breite: 4 },
          ],
          zeilen: b.fristen.map((x) => [z(f.datum(x.datum)), z(tq.fristArten[x.art]), z(x.kredit)]),
        },
    { titel: tq.abschnitte.kommentar, texte: [{ text: kommentar ?? tq.keinKommentar }] },
    { titel: tq.abschnitte.grundlagen, texte: [...tq.grundlagenText.map((text) => ({ text })), ...luecken] },
  ];
}
