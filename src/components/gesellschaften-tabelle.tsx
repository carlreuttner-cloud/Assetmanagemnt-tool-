import Link from "next/link";
import { Begriff, Kennzahl } from "@/components/herleitung";
import { Leer, MieteZelle, Tabelle, rechts } from "@/components/ui";
import type { Texte } from "@/i18n";
import type { IsoDatum } from "@/lib/datum";
import type { Formatierer } from "@/lib/format";
import type { Kennzahlen } from "@/lib/kennzahlen";

export type GesellschaftsZeile = {
  id: string;
  name: string;
  rechtsform: string | null;
  haeuser: Array<{ id: string; bezeichnung: string; ort: string | null }>;
  kredite: number;
  k: Kennzahlen;
};

/** Gesellschaften mit ihren Häusern und Kennzahlen; optional mit Summenzeile. */
export function GesellschaftenTabelle({
  zeilen,
  summe,
  summeText,
  t,
  f,
  stichtag,
}: {
  zeilen: GesellschaftsZeile[];
  summe?: Kennzahlen;
  summeText?: string;
  t: Texte;
  f: Formatierer;
  stichtag: IsoDatum;
}) {
  if (zeilen.length === 0) return <Leer>{t.allgemein.keineDaten}</Leer>;
  return (
    <Tabelle>
      <thead>
        <tr>
          <th>{t.gesellschaften.name}</th>
          <th className={rechts}>{t.kennzahlen.kredite}</th>
          <th className={rechts}>{t.kennzahlen.verkehrswert}</th>
          <th className={rechts}>{t.kennzahlen.restschuld}</th>
          <th className={rechts}>
            <Begriff k="LTV" t={t} />
          </th>
          <th className={rechts}>
            {t.kennzahlen.sollMiete} ({t.allgemein.monat} / {t.allgemein.jahr})
          </th>
          <th className={rechts}>{t.kennzahlen.leerstand}</th>
          <th className={rechts}>
            <Begriff k="DSCR" t={t} />
          </th>
        </tr>
      </thead>
      <tbody>
        {zeilen.map(({ id, name, rechtsform, haeuser, kredite, k }) => (
          <tr key={id} className="align-top hover:bg-slate-50">
            <td>
              <Link href={`/gesellschaften/${id}`} className="font-medium text-slate-900 hover:underline">
                {name}
              </Link>
              {rechtsform && <div className="text-xs text-slate-500">{rechtsform}</div>}
              {haeuser.length > 0 && (
                <ul className="mt-1 flex flex-wrap gap-1">
                  {haeuser.map((h) => (
                    <li key={h.id}>
                      <Link href={`/haeuser/${h.id}`} className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700 hover:bg-slate-200">
                        {h.bezeichnung}
                        {h.ort && <span className="text-slate-500"> · {h.ort}</span>}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </td>
            <td className={rechts}>{kredite}</td>
            <td className={rechts}>
              <Kennzahl art="verkehrswert" k={k} t={t} f={f} stichtag={stichtag} ganz ausrichtung="rechts" />
            </td>
            <td className={rechts}>
              <Kennzahl art="restschuld" k={k} t={t} f={f} stichtag={stichtag} ganz ausrichtung="rechts" />
            </td>
            <td className={rechts}>
              <Kennzahl art="ltv" k={k} t={t} f={f} stichtag={stichtag} ausrichtung="rechts" />
            </td>
            <td className={rechts}>
              <MieteZelle monat={f.betrag(k.sollMonat)} jahr={f.betrag(k.sollJahr)} />
            </td>
            <td className={rechts}>{f.prozent(k.leerstandQuote, 1)}</td>
            <td className={rechts}>
              <Kennzahl art="dscr" k={k} t={t} f={f} stichtag={stichtag} ausrichtung="rechts" />
            </td>
          </tr>
        ))}
      </tbody>
      {summe && zeilen.length > 1 && (
        <tfoot>
          <tr>
            <td>
              {summeText ?? t.allgemein.summe}
              <div className="text-xs font-normal text-slate-500">
                {summe.haeuser} {t.gesellschaften.haeuser}
              </div>
            </td>
            <td className={rechts}>{zeilen.reduce((s, z) => s + z.kredite, 0)}</td>
            <td className={rechts}>
              <Kennzahl art="verkehrswert" k={summe} t={t} f={f} stichtag={stichtag} ganz ausrichtung="rechts" />
            </td>
            <td className={rechts}>
              <Kennzahl art="restschuld" k={summe} t={t} f={f} stichtag={stichtag} ganz ausrichtung="rechts" />
            </td>
            <td className={rechts}>
              <Kennzahl art="ltv" k={summe} t={t} f={f} stichtag={stichtag} ausrichtung="rechts" />
            </td>
            <td className={rechts}>
              <MieteZelle monat={f.betrag(summe.sollMonat)} jahr={f.betrag(summe.sollJahr)} />
            </td>
            <td className={rechts}>{f.prozent(summe.leerstandQuote, 1)}</td>
            <td className={rechts}>
              <Kennzahl art="dscr" k={summe} t={t} f={f} stichtag={stichtag} ausrichtung="rechts" />
            </td>
          </tr>
        </tfoot>
      )}
    </Tabelle>
  );
}
