/**
 * Hausverwaltungen: Zuordnung je Haus mit Zeitraum, Leerstandsdauer und Leerstandsentwicklung
 * aus den gespeicherten Ständen der Mieterliste.
 */
import { monateZwischen, plusTage, type IsoDatum } from "./datum";
import type { Decimal } from "./geld";
import { addiereSummen, standAm, standSummen, type StandSummen, type StandZeile } from "./mieterstand";

export interface Zuordnung {
  id?: string;
  hausId: string;
  hausverwaltungId: string;
  von: IsoDatum;
  bis: IsoDatum | null;
}

const gilt = (z: Pick<Zuordnung, "von" | "bis">, stichtag: IsoDatum) => z.von <= stichtag && (z.bis === null || z.bis >= stichtag);

/** Zuordnung eines Hauses zum Stichtag (bei Überschneidung die mit dem späteren Beginn). */
export function zuordnungAm<T extends Zuordnung>(liste: T[], hausId: string, stichtag: IsoDatum): T | null {
  return liste.filter((z) => z.hausId === hausId && gilt(z, stichtag)).sort((a, b) => b.von.localeCompare(a.von))[0] ?? null;
}

/** Häuser, die eine Hausverwaltung zum Stichtag betreut. */
export function haeuserAm(liste: Zuordnung[], hausverwaltungId: string, stichtag: IsoDatum): string[] {
  const hausIds = [...new Set(liste.map((z) => z.hausId))];
  return hausIds.filter((h) => zuordnungAm(liste, h, stichtag)?.hausverwaltungId === hausverwaltungId);
}

/** Überschneidet sich ein Zeitraum mit einer anderen Zuordnung desselben Hauses? */
export function ueberschneidet(neu: Zuordnung, vorhandene: Zuordnung[]): Zuordnung | null {
  const ende = (z: Zuordnung) => z.bis ?? "9999-12-31";
  return vorhandene.find((z) => z.hausId === neu.hausId && z.id !== neu.id && z.von <= ende(neu) && neu.von <= ende(z)) ?? null;
}

// ---------------------------------------------------------------------------
// Leerstandsdauer

export interface LeerSeit {
  datum: IsoDatum;
  /** "vertragsende": Tag nach dem letzten Mietende; "spaetestens": erster Stand mit Leerstand (davor unbekannt) */
  art: "vertragsende" | "spaetestens";
  monate: number;
}

/**
 * Beginn des Leerstands: Tag nach dem letzten Mietende; sonst aus den Ständen der früheste Stand
 * einer ununterbrochenen Folge leerer Stände („spätestens seit“). Sonst unbekannt (null).
 */
export function leerSeit(enden: Array<IsoDatum | null>, staende: Array<{ stichtag: IsoDatum; leer: boolean | null }>, stichtag: IsoDatum): LeerSeit | null {
  const letztesEnde = enden.filter((e): e is IsoDatum => !!e && e < stichtag).sort().at(-1);
  if (letztesEnde) {
    const datum = plusTage(letztesEnde, 1);
    return { datum, art: "vertragsende", monate: Math.max(0, monateZwischen(datum, stichtag)) };
  }
  let frueheste: IsoDatum | null = null;
  for (const s of [...staende].filter((x) => x.stichtag <= stichtag).sort((a, b) => b.stichtag.localeCompare(a.stichtag))) {
    if (s.leer !== true) break;
    frueheste = s.stichtag;
  }
  return frueheste ? { datum: frueheste, art: "spaetestens", monate: Math.max(0, monateZwischen(frueheste, stichtag)) } : null;
}

/** Entgangene Soll-Miete seit Leerstandsbeginn: erwartete Miete × volle Monate; null, wenn unbekannt. */
export function entgangenSeit(erwarteteMiete: Decimal | null, seit: LeerSeit | null): Decimal | null {
  if (!erwarteteMiete || !seit) return null;
  return erwarteteMiete.times(seit.monate);
}

// ---------------------------------------------------------------------------
// Entwicklung

export interface StandFuerEntwicklung {
  id: string;
  hausId: string;
  stichtag: IsoDatum;
  erstelltAm: string;
  art: "VOLLSTAENDIG" | "NUR_LEERSTAND";
  zeilen: StandZeile[];
}

export interface EntwicklungsPunkt {
  stichtag: IsoDatum;
  summen: StandSummen;
  /** Häuser mit Stand zu diesem Tag */
  haeuser: number;
  /** davon mit Stand genau an diesem Tag */
  genau: number;
  /** mindestens ein Stand enthält nur Leerstandsdaten */
  nurLeerstand: boolean;
}

/**
 * Leerstandsentwicklung über alle Stichtage: je Stichtag die Summen der neuesten Stände je Haus.
 * Mit `hausverwaltungId` zählen nur Häuser, die zum jeweiligen Stichtag von ihr betreut wurden.
 * Für Stände mit nur Leerstandsdaten wird die Gesamtfläche aus den Stammdaten übernommen
 * (`flaecheJeHaus`), damit die Quote berechenbar ist; fehlt sie, bleibt die Quote unbekannt.
 */
export function entwicklung(
  staende: StandFuerEntwicklung[],
  o: { zuordnungen?: Zuordnung[]; hausverwaltungId?: string; hausId?: string; flaecheJeHaus?: Map<string, Decimal> } = {},
): EntwicklungsPunkt[] {
  const stichtage = [...new Set(staende.map((s) => s.stichtag))].sort();
  const nachHaus = new Map<string, StandFuerEntwicklung[]>();
  for (const s of staende) if (!o.hausId || s.hausId === o.hausId) nachHaus.set(s.hausId, [...(nachHaus.get(s.hausId) ?? []), s]);
  return stichtage
    .map((tag) => {
      const teile: StandSummen[] = [];
      let genau = 0;
      let nurLeerstand = false;
      for (const [hausId, liste] of nachHaus) {
        if (o.hausverwaltungId && zuordnungAm(o.zuordnungen ?? [], hausId, tag)?.hausverwaltungId !== o.hausverwaltungId) continue;
        const s = standAm(liste, tag);
        if (!s) continue;
        if (s.stichtag === tag) genau++;
        const summen = standSummen(s.zeilen);
        if (s.art === "NUR_LEERSTAND") {
          nurLeerstand = true;
          const gesamt = o.flaecheJeHaus?.get(hausId) ?? null;
          summen.flaeche = { wert: gesamt, unvollstaendig: gesamt === null };
          summen.istMonat = { wert: null, unvollstaendig: true };
          summen.sollMonat = { wert: null, unvollstaendig: true };
          summen.leerQuote =
            gesamt && summen.leerFlaeche.wert && !gesamt.isZero()
              ? { wert: summen.leerFlaeche.wert.dividedBy(gesamt).times(100).toDecimalPlaces(2), unvollstaendig: summen.leerFlaeche.unvollstaendig }
              : { wert: null, unvollstaendig: true };
        }
        teile.push(summen);
      }
      return { tag, teile, genau, nurLeerstand };
    })
    .filter((p) => p.teile.length > 0)
    .map((p) => ({ stichtag: p.tag, summen: addiereSummen(p.teile), haeuser: p.teile.length, genau: p.genau, nurLeerstand: p.nurLeerstand }));
}

