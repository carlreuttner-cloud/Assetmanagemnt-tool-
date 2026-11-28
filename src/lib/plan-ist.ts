/**
 * Plan/Ist-Vergleich je Gesellschaft und Geschäftsjahr. Plan = erfasstes Budget (Posten wie in der GuV),
 * Ist = erfasstes Geschäftsjahr gleichen Jahres (Jahresabschluss, BWA …). EBITDA, EBIT und EBT werden für
 * Plan und Ist mit derselben Formel gerechnet wie in den Finanzen. Fehlt eine Seite, bleibt die Abweichung
 * unbekannt. Wesentliche Abweichungen brauchen eine Erklärung; fehlt sie, wird das angezeigt. Reine Funktionen.
 */
import { dezimal, type Decimal } from "./geld";
import { GUV_POSTEN, rechne } from "./finanzen";

export type GuvPosten = (typeof GUV_POSTEN)[number];
export type PlanWerte = Record<GuvPosten, Decimal | null>;
export type Stufe = "ebitda" | "ebit" | "ebt";
export type PlanZeile = GuvPosten | Stufe;

/** Reihenfolge der Zeilen wie in der GuV, Zwischensummen an ihrer Stelle. */
export const PLAN_ZEILEN: readonly PlanZeile[] = [
  "umsatzerloese",
  "sonstigeErtraege",
  "materialaufwand",
  "personalaufwand",
  "sonstigeAufwendungen",
  "ebitda",
  "abschreibungen",
  "ebit",
  "zinsertraege",
  "zinsaufwendungen",
  "ebt",
  "steuern",
  "jahresergebnis",
];
export const STUFEN: readonly Stufe[] = ["ebitda", "ebit", "ebt"];
export const istStufe = (z: PlanZeile): z is Stufe =>
  (STUFEN as readonly string[]).includes(z);

/** Ergebniszeilen folgen aus den Posten; sie brauchen keine eigene Erklärung und zählen nicht doppelt. */
export const istErgebniszeile = (z: PlanZeile) => istStufe(z) || z === "jahresergebnis";

/** Aufwandszeilen: ein höheres Ist ist ungünstig. */
const AUFWAND: readonly PlanZeile[] = [
  "materialaufwand",
  "personalaufwand",
  "sonstigeAufwendungen",
  "abschreibungen",
  "zinsaufwendungen",
  "steuern",
];
export const istAufwand = (z: PlanZeile) => AUFWAND.includes(z);

/** Ab hier gilt eine Abweichung als wesentlich: beide Grenzen müssen erreicht sein (ohne Planwert reicht der Betrag). */
export const SCHWELLE_PROZENT = dezimal(5);
export const SCHWELLE_BETRAG = dezimal(10_000);

/** Teile der Zwischensummen, für die Herleitung. */
export const STUFEN_TEILE: Record<Stufe, Array<[1 | -1, PlanZeile]>> = {
  ebitda: [
    [1, "umsatzerloese"],
    [1, "sonstigeErtraege"],
    [-1, "materialaufwand"],
    [-1, "personalaufwand"],
    [-1, "sonstigeAufwendungen"],
  ],
  ebit: [
    [1, "ebitda"],
    [-1, "abschreibungen"],
  ],
  ebt: [
    [1, "ebit"],
    [1, "zinsertraege"],
    [-1, "zinsaufwendungen"],
  ],
};

/** Werte aller Zeilen einschließlich Zwischensummen; eine Zwischensumme ist unbekannt, sobald ein Teil fehlt. */
export function zeilenwerte(w: PlanWerte): Record<PlanZeile, Decimal | null> {
  const r = { ...w } as Record<PlanZeile, Decimal | null>;
  for (const s of STUFEN)
    r[s] = rechne(STUFEN_TEILE[s].map(([v, z]) => [v, r[z]]));
  return r;
}

export type Wirkung = "guenstig" | "unguenstig" | "keine";

export interface Abweichung {
  zeile: PlanZeile;
  plan: Decimal | null;
  ist: Decimal | null;
  /** Ist − Plan; null, wenn eine Seite unbekannt ist */
  betrag: Decimal | null;
  /** Abweichung ÷ |Plan| in Prozent; null ohne Planwert oder bei Plan 0 */
  prozent: Decimal | null;
  wirkung: Wirkung | null;
  wesentlich: boolean;
  erklaerung: string | null;
  /** wesentlich, aber noch nicht erklärt (nur Einzelposten) */
  erklaerungFehlt: boolean;
}

export function abweichung(
  zeile: PlanZeile,
  plan: Decimal | null,
  ist: Decimal | null,
  erklaerung: string | null,
): Abweichung {
  const betrag = plan === null || ist === null ? null : ist.minus(plan);
  const prozent =
    betrag === null || plan === null || plan.isZero()
      ? null
      : betrag.times(100).dividedBy(plan.abs());
  const wirkung: Wirkung | null =
    betrag === null
      ? null
      : betrag.isZero()
        ? "keine"
        : betrag.greaterThan(0) !== istAufwand(zeile)
          ? "guenstig"
          : "unguenstig";
  const wesentlich =
    betrag !== null &&
    betrag.abs().greaterThanOrEqualTo(SCHWELLE_BETRAG) &&
    (prozent === null || prozent.abs().greaterThanOrEqualTo(SCHWELLE_PROZENT));
  const text = erklaerung?.trim() || null;
  return {
    zeile,
    plan,
    ist,
    betrag,
    prozent,
    wirkung,
    wesentlich,
    erklaerung: text,
    erklaerungFehlt: wesentlich && text === null && !istErgebniszeile(zeile),
  };
}

export interface PlanIst {
  zeilen: Abweichung[];
  /** Anzahl wesentlicher Abweichungen bei den Einzelposten (ohne Ergebniszeilen) */
  /** Ist liegt vor (Geschäftsjahr erfasst) */
  mitIst: boolean;
  wesentlich: number;
  ohneErklaerung: number;
  /** Zeilen, deren Abweichung unbekannt ist, weil Plan oder Ist fehlt */
  unbekannt: number;
}

export function planIst(
  plan: PlanWerte,
  ist: PlanWerte | null,
  erklaerungen: Partial<Record<PlanZeile, string>>,
): PlanIst {
  const p = zeilenwerte(plan);
  const i = ist ? zeilenwerte(ist) : null;
  const zeilen = PLAN_ZEILEN.map((z) =>
    abweichung(z, p[z], i ? i[z] : null, erklaerungen[z] ?? null),
  );
  return {
    zeilen,
    mitIst: ist !== null,
    wesentlich: zeilen.filter((z) => z.wesentlich && !istErgebniszeile(z.zeile)).length,
    ohneErklaerung: zeilen.filter((z) => z.erklaerungFehlt).length,
    unbekannt: zeilen.filter((z) => z.betrag === null).length,
  };
}

export const leerePlanwerte = (): PlanWerte =>
  Object.fromEntries(GUV_POSTEN.map((p) => [p, null])) as PlanWerte;
