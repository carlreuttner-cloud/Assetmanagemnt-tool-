import "server-only";
import type { Kontext } from "@/lib/auth/kontext";
import { heute, type IsoDatum } from "@/lib/datum";
import type { Decimal } from "@/lib/geld";
import {
  leereArtWerte,
  type AbfrageErgebnis,
  type ArtWerte,
  type Feld,
  type FrageDaten,
  type Objekte,
  type PlanEintrag,
  type ReglerArt,
  type Wert,
  KENNZAHL_FELDER,
  KREDIT_FELDER,
  VERLAUF_FELDER,
} from "@/lib/ki-antwort";
import { gruppenKennzahlen, hausKennzahlen, summeOderUnbekannt, vollstaendig, zeitreihe, type HausDaten, type Kennzahlen } from "@/lib/kennzahlen";
import { kapitaldienstJahr, restschuldNachweis, zinsbindung, zinssatz, type KreditDaten, type ReferenzWert } from "@/lib/kredit";
import { jahresNettokaltmiete } from "@/lib/miete";
import { NUTZUNGSARTEN, type Nutzungsart } from "@/lib/nutzungsart";
import { basisParameter, rechneSzenario } from "@/lib/szenario";
import { dezimal } from "@/lib/geld";
import { erlaubt, ladeRechengrundlage } from "./portfolio";

const code = (praefix: string, i: number) => `${praefix}${String(i + 1).padStart(2, "0")}`;

type Grundlage = Awaited<ReturnType<typeof ladeRechengrundlage>>;

/** Sichtbare Gesellschaften und Häuser mit Kürzeln (G01, H01 …) für die KI. */
async function ladeObjekte(kontext: Kontext, grundlage: Grundlage): Promise<Objekte & { kredite: Array<{ id: string; name: string; bank: string | null; gesellschaftId: string }> }> {
  const { db } = kontext;
  const [gesellschaften, haeuser, kredite] = await Promise.all([
    db.gesellschaft.findMany({ where: { id: erlaubt(grundlage.sicht.gesellschaftIds) }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.haus.findMany({ where: { id: { in: grundlage.haeuser.map((h) => h.id) } }, orderBy: { bezeichnung: "asc" }, select: { id: true, bezeichnung: true, gesellschaftId: true } }),
    db.kredit.findMany({ where: { id: { in: grundlage.kredite.map((k) => k.id) } }, orderBy: { bezeichnung: "asc" }, select: { id: true, bezeichnung: true, bank: true, gesellschaftId: true } }),
  ]);
  const gCode = new Map(gesellschaften.map((g, i) => [g.id, code("G", i)]));
  return {
    gesellschaften: gesellschaften.map((g, i) => ({ code: code("G", i), id: g.id, name: g.name })),
    haeuser: haeuser.map((h, i) => ({ code: code("H", i), id: h.id, name: h.bezeichnung, gesellschaft: gCode.get(h.gesellschaftId) ?? "–" })),
    kredite: kredite.map((k) => ({ id: k.id, name: k.bezeichnung, bank: k.bank, gesellschaftId: k.gesellschaftId })),
  };
}

const wert = (w: Decimal | null | undefined, extra: Omit<Wert, "w"> = {}): Wert => ({ w: w == null ? null : w.toString(), ...extra });

/** Kennzahl-Felder aus berechneten Kennzahlen; unvollständige Summen werden gekennzeichnet. */
function kennzahlWerte(k: Kennzahlen, stichtag: IsoDatum): Partial<Record<Feld, Wert>> {
  const l = k.luecken;
  const unv = (art: keyof typeof l) => (!vollstaendig(l[art]) && l[art].bekannt > 0 ? { unvollstaendig: true } : {});
  return {
    sollJahr: wert(k.sollJahr, { stichtag }),
    istJahr: wert(k.istJahr, { stichtag }),
    leerstandQuote: wert(k.leerstandQuote, { stichtag }),
    flaeche: wert(k.flaeche),
    einheiten: wert(dezimal(k.einheiten), { stichtag }),
    leereEinheiten: wert(dezimal(k.leereEinheiten), { stichtag }),
    verkehrswert: wert(summeOderUnbekannt(k.verkehrswert, l.verkehrswert), unv("verkehrswert")),
    restschuld: wert(summeOderUnbekannt(k.restschuld, l.restschuld), unv("restschuld")),
    ltv: wert(k.ltv),
    dscr: wert(k.dscr),
    icr: wert(k.icr),
    kapitaldienstJahr: wert(summeOderUnbekannt(k.kapitaldienstJahr, l.kapitaldienst), unv("kapitaldienst")),
    rueckstand: wert(k.rueckstand, { stichtag }),
    sollProM2: wert(k.sollProM2, { stichtag }),
  };
}

function artWerte(k: Kennzahlen): Record<Nutzungsart, ArtWerte> {
  const r = leereArtWerte();
  for (const a of NUTZUNGSARTEN) {
    const x = k.nachArt[a];
    r[a] = { einheiten: x.einheiten, leereEinheiten: x.leereEinheiten, flaeche: x.flaeche.toString(), leerFlaeche: x.leerFlaeche.toString() };
  }
  return r;
}

function filter(grundlage: Grundlage, objekte: Objekte, objekt: string): { haeuser: HausDaten[]; kredite: KreditDaten[]; name: string | null; hausId: string | null } {
  if (objekt === "ALLE") return { haeuser: grundlage.haeuser, kredite: grundlage.kredite, name: null, hausId: null };
  const g = objekte.gesellschaften.find((x) => x.code === objekt);
  if (g) return { haeuser: grundlage.haeuser.filter((h) => h.gesellschaftId === g.id), kredite: grundlage.kredite.filter((k) => k.gesellschaftId === g.id), name: g.name, hausId: null };
  const h = objekte.haeuser.find((x) => x.code === objekt);
  if (h) return { haeuser: grundlage.haeuser.filter((x) => x.id === h.id), kredite: grundlage.kredite.filter((k) => k.haeuser.some((x) => x.hausId === h.id)), name: h.name, hausId: h.id };
  return { haeuser: [], kredite: [], name: null, hausId: null };
}

/** Jahresenden der letzten fünf Jahre und heute. */
function verlaufStichtage(stichtag: IsoDatum): IsoDatum[] {
  const jahr = Number(stichtag.slice(0, 4));
  return [...[5, 4, 3, 2, 1].map((n) => `${jahr - n}-12-31`), stichtag];
}

export type FrageGrundlage = Awaited<ReturnType<typeof ladeFrageGrundlage>>;

/** Rechengrundlage und sichtbare Objekte mit Kürzeln am heutigen Stichtag. */
export async function ladeFrageGrundlage(kontext: Kontext) {
  const stichtag = heute();
  const grundlage = await ladeRechengrundlage(kontext);
  const { kredite: kreditInfos, ...objekte } = await ladeObjekte(kontext, grundlage);
  return { stichtag, grundlage, objekte: objekte as Objekte, kreditInfos };
}

/**
 * Führt die Abfragen des Plans aus. Alles wird im Code berechnet (Kennzahlen, belegte
 * Restschuld, Kapitaldienst); fehlende Werte bleiben null.
 */
export function fuehreAbfragenAus(basisDaten: FrageGrundlage, plan: PlanEintrag[], allgemein: string): FrageDaten {
  const { stichtag, grundlage, objekte, kreditInfos } = basisDaten;
  const { referenzwerte } = grundlage;
  const ergebnisse: AbfrageErgebnis[] = [];

  plan.forEach((p, i) => {
    const id = `A${i + 1}`;
    const auswahl = filter(grundlage, objekte, p.objekt);
    const objektName = auswahl.name ?? allgemein;
    const basis = { id, art: p.art, objekt: p.objekt, objektName, stichtag };
    if (p.art === "KENNZAHLEN") {
      const h = auswahl.hausId ? grundlage.haeuser.find((x) => x.id === auswahl.hausId) : null;
      const k = h ? hausKennzahlen(h, grundlage.kredite, referenzwerte, stichtag) : gruppenKennzahlen(auswahl.haeuser, auswahl.kredite, referenzwerte, stichtag);
      ergebnisse.push({ ...basis, typ: "werte", felder: KENNZAHL_FELDER, werte: kennzahlWerte(k, stichtag), nachArt: artWerte(k) });
    } else if (p.art === "GESELLSCHAFTEN") {
      ergebnisse.push({
        ...basis,
        typ: "tabelle",
        felder: KENNZAHL_FELDER,
        zeilen: objekte.gesellschaften.map((g) => {
          const k = gruppenKennzahlen(grundlage.haeuser.filter((h) => h.gesellschaftId === g.id), grundlage.kredite.filter((x) => x.gesellschaftId === g.id), referenzwerte, stichtag);
          return { code: g.code, name: g.name, href: `/gesellschaften/${g.id}`, werte: kennzahlWerte(k, stichtag) };
        }),
      });
    } else if (p.art === "HAEUSER") {
      const ids = new Set(auswahl.haeuser.map((h) => h.id));
      ergebnisse.push({
        ...basis,
        typ: "tabelle",
        felder: KENNZAHL_FELDER,
        zeilen: objekte.haeuser
          .filter((h) => ids.has(h.id))
          .map((h) => {
            const daten = grundlage.haeuser.find((x) => x.id === h.id)!;
            return { code: h.code, name: h.name, href: `/haeuser/${h.id}`, werte: kennzahlWerte(hausKennzahlen(daten, grundlage.kredite, referenzwerte, stichtag), stichtag) };
          }),
      });
    } else if (p.art === "KREDITE") {
      const ids = new Set(auswahl.kredite.map((k) => k.id));
      ergebnisse.push({
        ...basis,
        typ: "tabelle",
        felder: KREDIT_FELDER,
        zeilen: kreditInfos
          .filter((k) => ids.has(k.id))
          .map((info, j) => {
            const k = grundlage.kredite.find((x) => x.id === info.id)!;
            const nachweis = restschuldNachweis(k, stichtag);
            const kd = kapitaldienstJahr(k, referenzwerte, stichtag);
            return {
              code: code("K", j),
              name: info.name,
              href: `/gesellschaften/kredite/${info.id}`,
              werte: {
                bank: { w: info.bank },
                zinsbindungBis: { w: zinsbindung(k, stichtag).bis },
                zinssatz: wert(zinssatz(k, referenzwerte, stichtag), { stichtag }),
                restschuld: wert(nachweis?.betrag, { stichtag: nachweis?.stichtag ?? null }),
                kapitaldienstJahr: wert(kd?.summe, kd?.quelle === "schaetzung" ? { hinweis: "schaetzung" } : {}),
              },
            };
          }),
      });
    } else {
      const punkte = zeitreihe(auswahl.haeuser, auswahl.kredite, verlaufStichtage(stichtag)).map((z) => ({
        x: z.datum,
        werte: { verkehrswert: wert(z.verkehrswert), restschuld: wert(z.restschuld), sollJahr: wert(jahresNettokaltmiete(z.sollMonat)) },
      }));
      ergebnisse.push({ ...basis, typ: "reihe", felder: VERLAUF_FELDER, punkte });
    }
  });

  return { objekte, ergebnisse };
}

/** Ergebnis eines Was-wäre-wenn-Reglers: fünf Jahre mit Basis und Änderung. */
export type ReglerErgebnis = {
  stichtag: IsoDatum;
  jahre: Array<{ jahr: number; basis: Record<"sollMiete" | "kapitaldienst" | "cashflow" | "dscr", string | null>; neu: Record<"sollMiete" | "kapitaldienst" | "cashflow" | "dscr", string | null> }>;
  luecken: { kreditOhneSaldo: number; kreditOhneZinssatz: number };
};

/**
 * Rechnet das Szenario mit den Werten der Regler für ein Objekt (ALLE, G…, H…) über die
 * Szenario-Rechnung (`rechneSzenario`). Die Kürzel werden neu aufgelöst, damit nur sichtbare
 * Objekte rechnen.
 */
export async function rechneRegler(kontext: Kontext, objekt: string, werte: Partial<Record<ReglerArt, Decimal>>): Promise<ReglerErgebnis | null> {
  const { stichtag, grundlage, objekte } = await ladeFrageGrundlage(kontext);
  const auswahl = filter(grundlage, objekte, objekt);
  if (objekt !== "ALLE" && !auswahl.name) return null;
  const ref: ReferenzWert[] = grundlage.referenzwerte;
  const basisP = basisParameter(5);
  const p = { ...basisP, ...werte, anschlusszins: werte.anschlusszins ?? null };
  const basis = rechneSzenario(auswahl.haeuser, auswahl.kredite, ref, stichtag, basisP);
  const neu = rechneSzenario(auswahl.haeuser, auswahl.kredite, ref, stichtag, p);
  const s = (d: Decimal | null) => (d === null ? null : d.toString());
  return {
    stichtag,
    jahre: neu.jahre.map((j, i) => {
      const b = basis.jahre[i];
      return {
        jahr: j.jahr,
        basis: { sollMiete: s(b.sollMiete), kapitaldienst: s(b.kapitaldienst), cashflow: s(b.cashflow), dscr: s(b.dscr) },
        neu: { sollMiete: s(j.sollMiete), kapitaldienst: s(j.kapitaldienst), cashflow: s(j.cashflow), dscr: s(j.dscr) },
      };
    }),
    luecken: { kreditOhneSaldo: neu.luecken.kreditOhneSaldo.length, kreditOhneZinssatz: neu.luecken.kreditOhneZinssatz.length },
  };
}
