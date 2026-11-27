/**
 * Warnungen für die Übersicht (reine Funktionen). Texte kommen aus src/i18n; hier stehen nur
 * Art, Dringlichkeit und Werte.
 *
 * Schwellen:
 * - Zinsbindung: abgelaufen oder in höchstens 12 Monaten = hoch, in 13 bis 24 Monaten = mittel.
 * - Covenant: verletzt = hoch; knapp (Abstand zum Schwellenwert unter 5 % des Schwellenwerts) = mittel.
 * - Ausschüttungssperre: aktiv (Bedingung verletzt) = hoch; knapp wie bei Covenants = mittel.
 * - Rückstand: je Haus; hoch, sobald ein Mieter mit mindestens zwei Monatsmieten (Soll) im
 *   Rückstand ist (Grenze für eine fristlose Kündigung nach § 543 BGB), sonst mittel.
 * - Leerstand: je Haus nach Fläche; ab 10 % hoch, darunter mittel.
 */
import { dezimal, type Decimal } from "./geld";
import type { IsoDatum } from "./datum";
import { covenantKennzahlen, hausKennzahlen, istAktiv, type HausDaten } from "./kennzahlen";
import { covenantPuffer, type Folge } from "./covenant";
import { restschuld, zinsbindung, type KreditDaten, type ReferenzWert } from "./kredit";

export type WarnStufe = "hoch" | "mittel";

export type Warnung =
  | { art: "zinsbindung"; stufe: WarnStufe; kreditId: string; bis: IsoDatum; monate: number; restschuld: Decimal | null }
  | ({ art: "covenant" } & CovenantWarnung)
  | ({ art: "sperre" } & CovenantWarnung)
  | { art: "rueckstand"; stufe: WarnStufe; hausId: string; anzahl: number; anzahlHoch: number; summe: Decimal }
  | { art: "leerstand"; stufe: WarnStufe; hausId: string; quote: Decimal; leereEinheiten: number; einheiten: number; erwartetMonat: Decimal };

export interface CovenantWarnung {
  stufe: WarnStufe;
  kreditId: string;
  kennzahl: string;
  vergleich: "HOECHSTENS" | "MINDESTENS";
  schwellenwert: Decimal;
  wert: Decimal;
  /** Abstand relativ zum Schwellenwert in Prozent (negativ = verletzt) */
  abstandRelativ: Decimal | null;
}

export interface CovenantDaten {
  kreditId: string;
  kennzahl: string;
  vergleich: "HOECHSTENS" | "MINDESTENS" | null;
  schwellenwert: Decimal | null;
  /** fehlt = Covenant */
  folge?: Folge;
}

export const SCHWELLEN = {
  covenantKnappProzent: 5,
  rueckstandMonatsmieten: 2,
  leerstandHochProzent: 10,
} as const;

export function ermittleWarnungen(
  haeuser: HausDaten[],
  kredite: KreditDaten[],
  covenants: CovenantDaten[],
  referenzwerte: ReferenzWert[],
  stichtag: IsoDatum,
): Warnung[] {
  const warnungen: Warnung[] = [];

  for (const k of kredite) {
    const zb = zinsbindung(k, stichtag);
    const rest = restschuld(k, stichtag);
    if (zb.bis && zb.monate !== null && (rest === null || rest.greaterThan(0)) && zb.stufe !== "spaeter" && zb.stufe !== "keine") {
      warnungen.push({
        art: "zinsbindung",
        stufe: zb.stufe === "unter24" ? "mittel" : "hoch",
        kreditId: k.id,
        bis: zb.bis,
        monate: zb.monate,
        restschuld: rest,
      });
    }

    const eigene = covenants.filter((c) => c.kreditId === k.id);
    if (eigene.length === 0) continue;
    const kz = covenantKennzahlen(k, haeuser, kredite, referenzwerte, stichtag);
    for (const c of eigene) {
      const p = covenantPuffer(c, kz);
      if (!p || !c.vergleich) continue;
      const knapp = p.abstandRelativ !== null && p.abstandRelativ.lessThan(SCHWELLEN.covenantKnappProzent);
      if (!p.eingehalten || knapp) {
        const basis: CovenantWarnung = {
          stufe: p.eingehalten ? "mittel" : "hoch",
          kreditId: k.id,
          kennzahl: c.kennzahl.trim().toUpperCase(),
          vergleich: c.vergleich,
          schwellenwert: p.schwellenwert,
          wert: p.wert,
          abstandRelativ: p.abstandRelativ,
        };
        warnungen.push(c.folge === "AUSSCHUETTUNGSSPERRE" ? { art: "sperre", ...basis } : { art: "covenant", ...basis });
      }
    }
  }

  for (const h of haeuser) {
    let anzahl = 0;
    let anzahlHoch = 0;
    let summe = dezimal(0);
    for (const m of h.einheiten.flatMap((e) => e.mietverhaeltnisse)) {
      if (m.rueckstand.lessThanOrEqualTo(0)) continue;
      anzahl++;
      summe = summe.plus(m.rueckstand);
      if (m.sollMiete.greaterThan(0) && m.rueckstand.greaterThanOrEqualTo(m.sollMiete.times(SCHWELLEN.rueckstandMonatsmieten))) anzahlHoch++;
    }
    if (anzahl > 0) warnungen.push({ art: "rueckstand", stufe: anzahlHoch > 0 ? "hoch" : "mittel", hausId: h.id, anzahl, anzahlHoch, summe });

    const kz = hausKennzahlen(h, [], referenzwerte, stichtag);
    if (kz.leerstandQuote && kz.leerstandQuote.greaterThan(0)) {
      warnungen.push({
        art: "leerstand",
        stufe: kz.leerstandQuote.greaterThanOrEqualTo(SCHWELLEN.leerstandHochProzent) ? "hoch" : "mittel",
        hausId: h.id,
        quote: kz.leerstandQuote,
        leereEinheiten: h.einheiten.filter((e) => !e.mietverhaeltnisse.some((m) => istAktiv(m, stichtag))).length,
        einheiten: h.einheiten.length,
        erwartetMonat: kz.erwartetLeerMonat,
      });
    }
  }

  const rang = (w: Warnung) => (w.stufe === "hoch" ? 0 : 1);
  return warnungen.sort((a, b) => rang(a) - rang(b));
}
