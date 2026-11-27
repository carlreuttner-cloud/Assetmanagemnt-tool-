/**
 * Bewertung: Gutachten und Marktwerte je Haus und Portfolio im Zeitverlauf. Reine Funktionen.
 *
 * Es wird nichts geschätzt. Der Gebäudewert kommt aus dem Gutachten; fehlt er dort, wird er als
 * Verkehrswert − Bodenwert abgeleitet und als „abgeleitet“ gekennzeichnet; ohne Bodenwert bleibt
 * er unbekannt. Summen nennen, wie viele Häuser einen Wert haben, und die Spanne der Stichtage,
 * statt Werte verschiedener Stichtage stillschweigend zu mischen.
 */
import type { IsoDatum } from "./datum";
import { dezimal, type Decimal } from "./geld";

export type GutachtenWert = {
  id: string;
  hausId: string;
  stichtag: IsoDatum;
  verkehrswert: Decimal;
  bodenwert: Decimal | null;
  gebaeudewert: Decimal | null;
  gutachter: string | null;
};

/** Marktwert ohne Gutachten (z. B. Bankbewertung, eigene Einschätzung) mit Quelle. */
export type Marktwert = { id: string; hausId: string; stichtag: IsoDatum; wert: Decimal; quelle: string | null };

export type Gebaeudewert = { wert: Decimal | null; art: "gutachten" | "abgeleitet" | null };

export function gebaeudewert(g: Pick<GutachtenWert, "verkehrswert" | "bodenwert" | "gebaeudewert">): Gebaeudewert {
  if (g.gebaeudewert) return { wert: g.gebaeudewert, art: "gutachten" };
  if (g.bodenwert) return { wert: g.verkehrswert.minus(g.bodenwert), art: "abgeleitet" };
  return { wert: null, art: null };
}

export type HausBewertung = {
  letztes: GutachtenWert | null;
  vorher: GutachtenWert | null;
  veraenderung: Decimal | null;
  veraenderungProzent: Decimal | null;
  gebaeude: Gebaeudewert;
  /** jüngster Marktwert ohne Gutachten */
  marktwert: Marktwert | null;
  /** jüngster Wert überhaupt; bei gleichem Stichtag gilt das Gutachten */
  aktuell: { wert: Decimal; stichtag: IsoDatum; art: "gutachten" | "marktwert"; quelle: string | null } | null;
};

const absteigend = <T extends { stichtag: IsoDatum }>(liste: T[]) => [...liste].sort((a, b) => (a.stichtag < b.stichtag ? 1 : a.stichtag > b.stichtag ? -1 : 0));

/** Bewertung eines Hauses, optional nur mit Werten bis zu einem Stichtag (einschließlich). */
export function bewerteHaus(gutachten: GutachtenWert[], marktwerte: Marktwert[], bis?: IsoDatum): HausBewertung {
  const g = absteigend(bis ? gutachten.filter((x) => x.stichtag <= bis) : gutachten);
  const m = absteigend(bis ? marktwerte.filter((x) => x.stichtag <= bis) : marktwerte);
  const [letztes = null, vorher = null] = g;
  const marktwert = m[0] ?? null;
  const veraenderung = letztes && vorher ? letztes.verkehrswert.minus(vorher.verkehrswert) : null;
  const aktuell =
    letztes && (!marktwert || letztes.stichtag >= marktwert.stichtag)
      ? { wert: letztes.verkehrswert, stichtag: letztes.stichtag, art: "gutachten" as const, quelle: letztes.gutachter }
      : marktwert
        ? { wert: marktwert.wert, stichtag: marktwert.stichtag, art: "marktwert" as const, quelle: marktwert.quelle }
        : null;
  return {
    letztes,
    vorher,
    veraenderung,
    veraenderungProzent: veraenderung && vorher && !vorher.verkehrswert.isZero() ? veraenderung.dividedBy(vorher.verkehrswert).times(100) : null,
    gebaeude: letztes ? gebaeudewert(letztes) : { wert: null, art: null },
    marktwert,
    aktuell,
  };
}

/** Summe bekannter Werte mit Zählung; `vollstaendig` nur, wenn kein Teil fehlt. */
export type Teilsumme = { summe: Decimal | null; bekannt: number; gesamt: number; vollstaendig: boolean };

function teilsumme(werte: Array<Decimal | null>): Teilsumme {
  const bekannt = werte.filter((w): w is Decimal => w !== null);
  return {
    summe: bekannt.length > 0 ? bekannt.reduce((s, w) => s.plus(w), dezimal(0)) : null,
    bekannt: bekannt.length,
    gesamt: werte.length,
    vollstaendig: werte.length > 0 && bekannt.length === werte.length,
  };
}

export type BewertungsHaus = { hausId: string; kaufdatum: IsoDatum | null; gutachten: GutachtenWert[]; marktwerte: Marktwert[] };

export type PortfolioStand = {
  stichtag: IsoDatum;
  /** jüngster Wert je Haus (Gutachten oder Marktwert) */
  wert: Teilsumme;
  /** aus dem jeweils letzten Gutachten */
  verkehrswertGutachten: Teilsumme;
  bodenwert: Teilsumme;
  gebaeudewert: Teilsumme & { abgeleitet: number };
  stichtageVon: IsoDatum | null;
  stichtageBis: IsoDatum | null;
};

/** Stand des Portfolios zu einem Stichtag; Häuser mit späterem Kaufdatum zählen nicht mit. */
export function portfolioStand(haeuser: BewertungsHaus[], stichtag: IsoDatum): PortfolioStand {
  const im = haeuser.filter((h) => !h.kaufdatum || h.kaufdatum <= stichtag);
  const b = im.map((h) => bewerteHaus(h.gutachten, h.marktwerte, stichtag));
  const stichtage = b.flatMap((x) => (x.aktuell ? [x.aktuell.stichtag] : [])).sort();
  const gebaeude = b.map((x) => x.gebaeude);
  return {
    stichtag,
    wert: teilsumme(b.map((x) => x.aktuell?.wert ?? null)),
    verkehrswertGutachten: teilsumme(b.map((x) => x.letztes?.verkehrswert ?? null)),
    bodenwert: teilsumme(b.map((x) => x.letztes?.bodenwert ?? null)),
    gebaeudewert: { ...teilsumme(gebaeude.map((x) => x.wert)), abgeleitet: gebaeude.filter((x) => x.art === "abgeleitet").length },
    stichtageVon: stichtage[0] ?? null,
    stichtageBis: stichtage[stichtage.length - 1] ?? null,
  };
}

/**
 * Jahresverlauf zum 31.12. je Jahr (ab dem ersten Jahr mit einem Wert) bis `bis`; das laufende Jahr
 * endet am Stichtag `bis` statt in der Zukunft. Veränderung zum Vorjahr nur, wenn beide Jahre vollständig sind.
 */
export function portfolioJahre(haeuser: BewertungsHaus[], bis: IsoDatum): Array<PortfolioStand & { jahr: number; veraenderung: Decimal | null }> {
  const alle = haeuser.flatMap((h) => [...h.gutachten.map((g) => g.stichtag), ...h.marktwerte.map((m) => m.stichtag)]).sort();
  if (alle.length === 0) return [];
  const ab = Number(alle[0].slice(0, 4));
  const jahre: Array<PortfolioStand & { jahr: number }> = [];
  const bisJahr = Number(bis.slice(0, 4));
  for (let jahr = ab; jahr <= bisJahr; jahr++) jahre.push({ jahr, ...portfolioStand(haeuser, jahr === bisJahr ? bis : `${jahr}-12-31`) });
  return jahre.map((j, i) => {
    const v = jahre[i - 1];
    return { ...j, veraenderung: v && v.wert.vollstaendig && j.wert.vollstaendig && v.wert.gesamt === j.wert.gesamt ? j.wert.summe!.minus(v.wert.summe!) : null };
  });
}
