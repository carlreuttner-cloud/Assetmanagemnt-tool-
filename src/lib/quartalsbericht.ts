/**
 * Quartalsbericht: eingefrorener Stand zum Quartalsende (Portfolio oder eine Gesellschaft) mit
 * Vergleich zum Vorquartal. Reine Funktionen; Kennzahlen wie in der Übersicht
 * (`gruppenKennzahlen`), Restschuld nur aus Belegen, Lücken werden mitgeführt und nie als 0 ergänzt.
 *
 * Freigabe nach dem Vier-Augen-Prinzip: Ein Entwurf kann nur von einer anderen Person freigegeben
 * werden als der, die ihn erstellt hat. Freigegebene Berichte ändern sich nicht mehr.
 */
import { covenantPuffer, sperrenStatus } from "./covenant";
import { monatsende, plusMonate, type IsoDatum } from "./datum";
import { dezimal, type Decimal } from "./geld";
import { covenantKennzahlen, gruppenKennzahlen, hausKennzahlen, summeOderUnbekannt, verkehrswertEintragAm, type HausDaten, type Kennzahlen, type Vollstaendigkeit } from "./kennzahlen";
import { restschuldNachweis, zinsbindung, zinssatz, type KreditDaten, type ReferenzWert } from "./kredit";
import { aktuelleKontostaende, type KontostandDaten } from "./liquiditaet";

export type Quartal = 1 | 2 | 3 | 4;

export function quartalsende(jahr: number, quartal: Quartal): IsoDatum {
  return monatsende(jahr * 12 + quartal * 3 - 1);
}

/** Letztes abgeschlossenes Quartal bis zum Stichtag (Quartalsende ≤ Stichtag). */
export function letztesQuartal(stichtag: IsoDatum): { jahr: number; quartal: Quartal } {
  let jahr = Number(stichtag.slice(0, 4));
  let quartal = Math.ceil(Number(stichtag.slice(5, 7)) / 3) as Quartal;
  if (quartalsende(jahr, quartal) > stichtag) {
    quartal = (quartal === 1 ? 4 : quartal - 1) as Quartal;
    if (quartal === 4) jahr--;
  }
  return { jahr, quartal };
}

export function vorquartal(jahr: number, quartal: Quartal): { jahr: number; quartal: Quartal } {
  return quartal === 1 ? { jahr: jahr - 1, quartal: 4 } : { jahr, quartal: (quartal - 1) as Quartal };
}

type Zahl = string;
type Luecke = { bekannt: number; fehlend: number; von: IsoDatum | null; bis: IsoDatum | null; geschaetzt: number };

export interface KennzahlStand {
  stichtag: IsoDatum;
  haeuser: number;
  einheiten: number;
  leereEinheiten: number;
  verkehrswert: Zahl | null;
  restschuld: Zahl | null;
  sollJahr: Zahl;
  istJahr: Zahl;
  kapitaldienstJahr: Zahl | null;
  zinsenJahr: Zahl | null;
  ltv: Zahl | null;
  dscr: Zahl | null;
  icr: Zahl | null;
  leerstandQuote: Zahl | null;
  luecken: { verkehrswert: Luecke; restschuld: Luecke; kapitaldienst: Luecke };
}

export interface QuartalsberichtInhalt {
  version: 1;
  umfang: { art: "portfolio" | "gesellschaft"; name: string };
  mandant: string;
  jahr: number;
  quartal: Quartal;
  stichtag: IsoDatum;
  erstelltAm: string;
  erstelltVon: string;
  aktuell: KennzahlStand;
  vorquartal: KennzahlStand;
  haeuser: Array<{ name: string; verkehrswert: { wert: Zahl; stichtag: IsoDatum } | null; sollJahr: Zahl; istJahr: Zahl; leerstandQuote: Zahl | null; ltv: Zahl | null }>;
  kredite: Array<{ name: string; bank: string | null; restschuld: { betrag: Zahl; stichtag: IsoDatum } | null; zinssatz: Zahl | null; zinsbindungBis: IsoDatum | null; laufzeitBis: IsoDatum | null }>;
  covenants: Array<{ kredit: string; kennzahl: string; folge: "COVENANT" | "AUSSCHUETTUNGSSPERRE"; vergleich: "HOECHSTENS" | "MINDESTENS" | null; schwellenwert: Zahl | null; wert: Zahl | null; status: "frei" | "aktiv" | "manuell" }>;
  liquiditaet: { summe: Zahl | null; konten: Array<{ gesellschaft: string; konto: string; betrag: Zahl; stichtag: IsoDatum }>; ohneKontostand: string[] };
  fristen: Array<{ art: "zinsbindung" | "kreditende"; datum: IsoDatum; kredit: string }>;
}

const z = (d: Decimal | null | undefined): Zahl | null => (d == null ? null : d.toString());
const luecke = (v: Vollstaendigkeit): Luecke => ({ ...v });

function stand(kz: Kennzahlen, stichtag: IsoDatum): KennzahlStand {
  return {
    stichtag,
    haeuser: kz.haeuser,
    einheiten: kz.einheiten,
    leereEinheiten: kz.leereEinheiten,
    verkehrswert: z(summeOderUnbekannt(kz.verkehrswert, kz.luecken.verkehrswert)),
    restschuld: z(summeOderUnbekannt(kz.restschuld, kz.luecken.restschuld)),
    sollJahr: kz.sollJahr.toString(),
    istJahr: kz.istJahr.toString(),
    kapitaldienstJahr: z(summeOderUnbekannt(kz.kapitaldienstJahr, kz.luecken.kapitaldienst)),
    zinsenJahr: z(summeOderUnbekannt(kz.zinsenJahr, kz.luecken.kapitaldienst)),
    ltv: z(kz.ltv),
    dscr: z(kz.dscr),
    icr: z(kz.icr),
    leerstandQuote: z(kz.leerstandQuote),
    luecken: { verkehrswert: luecke(kz.luecken.verkehrswert), restschuld: luecke(kz.luecken.restschuld), kapitaldienst: luecke(kz.luecken.kapitaldienst) },
  };
}

export interface QuartalsberichtEingabe {
  umfang: { art: "portfolio" | "gesellschaft"; name: string };
  mandant: string;
  jahr: number;
  quartal: Quartal;
  erstelltAm: Date;
  erstelltVon: string;
  haeuser: HausDaten[];
  kredite: KreditDaten[];
  referenzwerte: ReferenzWert[];
  namen: { haus: Map<string, string>; kredit: Map<string, { name: string; bank: string | null }>; gesellschaft: Map<string, string> };
  covenants: Array<{ kreditId: string; kennzahl: string; folge: "COVENANT" | "AUSSCHUETTUNGSSPERRE"; vergleich: "HOECHSTENS" | "MINDESTENS" | null; schwellenwert: Decimal | null }>;
  kontostaende: Array<KontostandDaten & { gesellschaftId: string }>;
  gesellschaftIds: string[];
}

export function erstelleQuartalsbericht(e: QuartalsberichtEingabe): QuartalsberichtInhalt {
  const stichtag = quartalsende(e.jahr, e.quartal);
  const vq = vorquartal(e.jahr, e.quartal);
  const vorStichtag = quartalsende(vq.jahr, vq.quartal);
  const kreditName = (id: string) => e.namen.kredit.get(id)?.name ?? id;

  const haeuser = e.haeuser
    .map((h) => {
      const kz = hausKennzahlen(h, e.kredite, e.referenzwerte, stichtag);
      const vw = verkehrswertEintragAm(h, stichtag);
      return { name: e.namen.haus.get(h.id) ?? h.id, verkehrswert: vw ? { wert: vw.wert.toString(), stichtag: vw.stichtag } : null, sollJahr: kz.sollJahr.toString(), istJahr: kz.istJahr.toString(), leerstandQuote: z(kz.leerstandQuote), ltv: z(kz.ltv) };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  const kredite = e.kredite
    .map((k) => {
      const rest = restschuldNachweis(k, stichtag);
      return {
        name: kreditName(k.id),
        bank: e.namen.kredit.get(k.id)?.bank ?? null,
        restschuld: rest ? { betrag: rest.betrag.toString(), stichtag: rest.stichtag } : null,
        zinssatz: z(zinssatz(k, e.referenzwerte, stichtag)),
        zinsbindungBis: zinsbindung(k, stichtag).bis,
        laufzeitBis: k.laufzeitBis,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  const covenants = e.covenants.flatMap((c) => {
    const k = e.kredite.find((x) => x.id === c.kreditId);
    if (!k) return [];
    const kz = covenantKennzahlen(k, e.haeuser, e.kredite, e.referenzwerte, stichtag);
    const puffer = covenantPuffer(c, kz);
    const wert = c.kennzahl.trim().toUpperCase() === "LTV" ? kz.ltv : c.kennzahl.trim().toUpperCase() === "DSCR" ? kz.dscr : c.kennzahl.trim().toUpperCase() === "ICR" ? kz.icr : null;
    return [{ kredit: kreditName(k.id), kennzahl: c.kennzahl, folge: c.folge, vergleich: c.vergleich, schwellenwert: z(c.schwellenwert), wert: z(wert), status: sperrenStatus(puffer) }];
  });

  const aktuelleKonten = e.gesellschaftIds.map((g) => ({ g, konten: aktuelleKontostaende(e.kontostaende.filter((k) => k.gesellschaftId === g), stichtag) }));
  const ohneKontostand = aktuelleKonten.filter((x) => x.konten.length === 0).map((x) => e.namen.gesellschaft.get(x.g) ?? x.g);
  const konten = aktuelleKonten.flatMap((x) => x.konten.map((k) => ({ gesellschaft: e.namen.gesellschaft.get(x.g) ?? x.g, konto: k.konto, betrag: k.betrag.toString(), stichtag: k.stichtag })));
  const summe = ohneKontostand.length > 0 ? null : konten.reduce((s, k) => s.plus(dezimal(k.betrag)), dezimal(0));

  const bis = plusMonate(stichtag, 12);
  const fristen: QuartalsberichtInhalt["fristen"] = [];
  for (const k of e.kredite) {
    if (k.zinsArt === "FEST" && k.zinsbindungBis && k.zinsbindungBis > stichtag && k.zinsbindungBis <= bis) fristen.push({ art: "zinsbindung", datum: k.zinsbindungBis, kredit: kreditName(k.id) });
    if (k.laufzeitBis && k.laufzeitBis > stichtag && k.laufzeitBis <= bis) fristen.push({ art: "kreditende", datum: k.laufzeitBis, kredit: kreditName(k.id) });
  }
  fristen.sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : a.kredit.localeCompare(b.kredit, "de")));

  return {
    version: 1,
    umfang: e.umfang,
    mandant: e.mandant,
    jahr: e.jahr,
    quartal: e.quartal,
    stichtag,
    erstelltAm: e.erstelltAm.toISOString(),
    erstelltVon: e.erstelltVon,
    aktuell: stand(gruppenKennzahlen(e.haeuser, e.kredite, e.referenzwerte, stichtag), stichtag),
    vorquartal: stand(gruppenKennzahlen(e.haeuser, e.kredite, e.referenzwerte, vorStichtag), vorStichtag),
    haeuser,
    kredite,
    covenants,
    liquiditaet: { summe: z(summe), konten, ohneKontostand },
    fristen,
  };
}

/** Darf diese Person den Entwurf freigeben? Nur jemand anderes als der Ersteller. */
export function darfFreigeben(bericht: { status: string; erstelltVonId: string }, benutzerId: string): "ja" | "selbst" | "status" {
  if (bericht.status !== "ENTWURF") return "status";
  return bericht.erstelltVonId === benutzerId ? "selbst" : "ja";
}

/** Veränderung zum Vorquartal; null, wenn ein Wert fehlt. */
export function veraenderung(jetzt: Zahl | null, vorher: Zahl | null): Decimal | null {
  return jetzt === null || vorher === null ? null : dezimal(jetzt).minus(dezimal(vorher));
}
