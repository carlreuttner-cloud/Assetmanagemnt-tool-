import { MitHerleitung, Unbekannt } from "@/components/herleitung";
import { MieteZelle } from "@/components/ui";
import { fuelle, type Texte } from "@/i18n";
import type { Formatierer } from "@/lib/format";
import type { Decimal } from "@/lib/geld";
import type { MassnahmeAuswertung } from "@/lib/massnahme";

type M = { budget: Decimal | null; budgetQuelle: string | null; mehrmieteMonat: Decimal | null; mehrmieteBelegt: boolean; mehrmieteQuelle: string | null; status: string };
type P = { m: M; a: MassnahmeAuswertung; anzahlKosten: number; t: Texte; f: Formatierer };

export function BudgetWert({ m, t, f }: P) {
  const tm = t.massnahmen;
  if (!m.budget) return <span className="text-xs italic text-amber-700">{tm.keinBudget}</span>;
  return <MitHerleitung wert={f.betragGanz(m.budget)} herleitung={{ quelle: m.budgetQuelle ?? t.allgemein.unbekannt }} t={t} ausrichtung="rechts" />;
}

export function IstWert({ a, anzahlKosten, t, f }: P) {
  const tm = t.massnahmen;
  if (!a.ist) return <span className="text-xs italic text-slate-400">{tm.keineKosten}</span>;
  return <MitHerleitung wert={f.betragGanz(a.ist)} herleitung={{ berechnung: `${tm.istFormel} (${anzahlKosten})` }} t={t} ausrichtung="rechts" />;
}

export function AbweichungWert({ m, a, t, f }: P) {
  const tm = t.massnahmen;
  if (!a.abweichung) return <span className="text-slate-400">–</span>;
  const ton = a.abweichung.isPositive() && !a.abweichung.isZero() ? "text-red-700" : "text-emerald-700";
  const vz = a.abweichung.isNegative() ? "" : "+";
  return (
    <MitHerleitung
      wert={
        <span className={ton}>
          {vz}
          {f.betragGanz(a.abweichung)}
          {a.abweichungProzent && ` (${vz}${f.prozent(a.abweichungProzent, 1)})`}
        </span>
      }
      herleitung={{
        berechnung: tm.abweichungFormel,
        werte: [
          [tm.ist, f.betragGanz(a.ist)],
          [tm.budget, f.betragGanz(m.budget)],
        ],
      }}
      t={t}
      ausrichtung="rechts"
    />
  );
}

export function MehrmieteWert({ m, a, t, f }: P) {
  const tm = t.massnahmen;
  if (m.mehrmieteMonat === null || a.mehrmieteJahr === null) return <Unbekannt t={t} />;
  return (
    <MitHerleitung
      wert={<MieteZelle monat={f.betrag(m.mehrmieteMonat)} jahr={`${f.betrag(a.mehrmieteJahr)} · ${m.mehrmieteBelegt ? tm.belegt : tm.erwartet}`} />}
      herleitung={{ berechnung: t.glossar.Mehrmiete.lang, quelle: m.mehrmieteQuelle ?? t.allgemein.unbekannt }}
      t={t}
      ausrichtung="rechts"
    />
  );
}

export function RenditeWert({ m, a, t, f, art }: P & { art: "rendite" | "amortisation" }) {
  const tm = t.massnahmen;
  const basis = a.basis === "ist" ? tm.basisIst : a.basis === "budget" ? tm.basisBudget : null;
  const wert = art === "rendite" ? a.rendite : a.amortisationJahre;
  const fehlt = [
    ...(a.mehrmieteJahr === null ? [tm.mehrmieteMonat] : []),
    ...(a.basis === null ? [m.status === "ABGESCHLOSSEN" ? tm.basisFehlt : tm.budget] : []),
  ];
  const formel = fuelle(art === "rendite" ? tm.renditeFormel : tm.amortisationFormel, { basis: basis ?? tm.basisIst });
  return (
    <MitHerleitung
      wert={wert === null ? <Unbekannt t={t} /> : art === "rendite" ? f.prozent(wert, 1) : fuelle(tm.jahre, { jahre: wert.toDecimalPlaces(1).toFixed(1).replace(".", ",") })}
      herleitung={{
        berechnung: formel,
        werte: [
          [`${tm.mehrmiete.split(" (")[0]} (Jahr)`, a.mehrmieteJahr ? f.betragGanz(a.mehrmieteJahr) : t.allgemein.unbekannt],
          [basis ?? tm.basisIst, a.basisWert ? f.betragGanz(a.basisWert) : t.allgemein.unbekannt],
        ],
        quelle: m.mehrmieteQuelle ?? undefined,
        fehlt,
        hinweis: a.mehrmieteJahr?.isZero() && art === "amortisation" ? t.glossar.Amortisation.lang : undefined,
      }}
      t={t}
      ausrichtung="rechts"
    />
  );
}
