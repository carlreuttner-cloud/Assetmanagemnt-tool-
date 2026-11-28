"use client";

/**
 * Was-wäre-wenn-Regler in einer KI-Antwort. Die Regler starten bei 0 (die KI gibt keine Werte
 * vor); gerechnet wird auf dem Server mit der Szenario-Rechnung der Software.
 */
import { useEffect, useState, useTransition } from "react";
import { formatierer } from "@/lib/format";
import type { ReglerArt } from "@/lib/ki-antwort";
import type { ReglerErgebnis } from "@/lib/daten/ki-fragen";
import { reglerRechnen } from "./aktionen";

export type ReglerTexte = Record<
  | ReglerArt
  | "objekt" | "anschlussAus" | "rechnen" | "rechnet" | "jahr" | "sollMiete" | "kapitaldienst" | "cashflow" | "dscr" | "basis" | "neu" | "herleitung" | "luecken" | "fehler" | "startHinweis" | "titel" | "glossarDscr" | "unbekannt",
  string
>;

const BEREICH: Record<ReglerArt, { min: number; max: number; schritt: number }> = {
  mietsteigerung: { min: -5, max: 10, schritt: 0.5 },
  mietausfall: { min: 0, max: 50, schritt: 1 },
  zinsVariabelPP: { min: -3, max: 5, schritt: 0.25 },
  anschlusszins: { min: 0, max: 10, schritt: 0.25 },
};

const fuelle = (text: string, werte: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (_, k: string) => String(werte[k] ?? ""));

export function Regler({ objekt, objektName, regler, texte, sprache, waehrung }: { objekt: string; objektName: string; regler: ReglerArt[]; texte: ReglerTexte; sprache: string; waehrung: string }) {
  const f = formatierer({ sprache, waehrung });
  const [werte, setWerte] = useState<Partial<Record<ReglerArt, number | null>>>(() => Object.fromEntries(regler.map((r) => [r, r === "anschlusszins" ? null : 0])));
  const [ergebnis, setErgebnis] = useState<ReglerErgebnis | null | undefined>(undefined);
  const [laeuft, starte] = useTransition();

  const rechne = (w: typeof werte) =>
    starte(async () => {
      const text = Object.fromEntries(Object.entries(w).map(([k, v]) => [k, v === null || v === undefined ? null : String(v)]));
      const r = await reglerRechnen(objekt, text);
      setErgebnis(r.ergebnis);
    });

  useEffect(() => {
    rechne(werte);
    // nur beim ersten Anzeigen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const betrag = (s: string | null) => (s === null ? texte.unbekannt : f.betragGanz(s));
  const faktor = (s: string | null) => (s === null ? texte.unbekannt : f.faktor(s));
  const zeilen: Array<{ schluessel: "sollMiete" | "kapitaldienst" | "cashflow" | "dscr"; format: (s: string | null) => string }> = [
    { schluessel: "sollMiete", format: betrag },
    { schluessel: "kapitaldienst", format: betrag },
    { schluessel: "cashflow", format: betrag },
    { schluessel: "dscr", format: faktor },
  ];

  return (
    <div className="space-y-4" data-baustein="REGLER">
      <p className="text-xs text-slate-500">
        {fuelle(texte.objekt, { objekt: objektName })} · {texte.startHinweis}
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {regler.map((r) => {
          const b = BEREICH[r];
          const v = werte[r];
          return (
            <label key={r} className="block text-sm">
              <span className="flex justify-between gap-2 text-slate-700">
                <span>{texte[r]}</span>
                <span className="tabular-nums font-medium">{v === null || v === undefined ? texte.anschlussAus : f.zahl(v, 2)}</span>
              </span>
              <input
                type="range"
                min={b.min}
                max={b.max}
                step={b.schritt}
                value={v ?? 0}
                onChange={(e) => setWerte((alt) => ({ ...alt, [r]: Number(e.target.value) }))}
                className="mt-1 w-full accent-teal-700"
                data-regler={r}
              />
              {r === "anschlusszins" && v !== null && (
                <button type="button" className="text-xs text-slate-500 underline" onClick={() => setWerte((alt) => ({ ...alt, anschlusszins: null }))}>
                  {texte.anschlussAus}
                </button>
              )}
            </label>
          );
        })}
      </div>
      <button type="button" onClick={() => rechne(werte)} disabled={laeuft} className="rounded-md bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60" data-regler-rechnen>
        {laeuft ? texte.rechnet : texte.rechnen}
      </button>

      {ergebnis === null && <p className="text-sm text-amber-800">{texte.fehler}</p>}
      {ergebnis && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-regler-ergebnis>
            <thead>
              <tr className="text-left text-xs text-slate-500">
                <th className="py-1 pr-3 font-medium">{texte.jahr}</th>
                {ergebnis.jahre.map((j) => (
                  <th key={j.jahr} className="py-1 pr-3 text-right font-medium">
                    {j.jahr}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z) => (
                <tr key={z.schluessel} className="border-t border-slate-100 align-top">
                  <td className="py-1.5 pr-3 text-slate-700" title={z.schluessel === "dscr" ? texte.glossarDscr : undefined}>
                    {texte[z.schluessel]}
                    <div className="text-[10px] text-slate-400">
                      {texte.neu} / {texte.basis}
                    </div>
                  </td>
                  {ergebnis.jahre.map((j) => {
                    const neu = j.neu[z.schluessel];
                    const basis = j.basis[z.schluessel];
                    return (
                      <td key={j.jahr} className="py-1.5 pr-3 text-right tabular-nums">
                        <div className={neu !== basis ? "font-medium text-slate-900" : "text-slate-700"}>{z.format(neu)}</div>
                        <div className="text-[10px] text-slate-400">{z.format(basis)}</div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-slate-500">{fuelle(texte.herleitung, { datum: f.datum(ergebnis.stichtag) })}</p>
          {(ergebnis.luecken.kreditOhneSaldo > 0 || ergebnis.luecken.kreditOhneZinssatz > 0) && (
            <p className="mt-1 text-xs text-amber-800">{fuelle(texte.luecken, { saldo: ergebnis.luecken.kreditOhneSaldo, zins: ergebnis.luecken.kreditOhneZinssatz })}</p>
          )}
        </div>
      )}
    </div>
  );
}
