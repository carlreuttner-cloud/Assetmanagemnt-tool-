/**
 * Stand-Auswahl und farbiger Vergleich zweier Stände der Mieterliste. Wird in der Einheiten-
 * und in der Mieteransicht oben gezeigt.
 */
import { Fragment, type ReactNode } from "react";
import { MitHerleitung } from "@/components/herleitung";
import { NutzungsartMarke } from "@/components/nutzungsart";
import { Karte, Leer, Marke, knopfKlasse, rechts } from "@/components/ui";
import { fuelle, type Texte } from "@/i18n";
import type { HausVergleich, StandAnsicht } from "@/lib/daten/mieterstand";
import { AENDERUNG_FARBE } from "@/lib/farben";
import type { Formatierer } from "@/lib/format";
import type { Decimal } from "@/lib/geld";
import { jahresNettokaltmiete } from "@/lib/miete";
import {
  istGeaendert,
  mieteJeQm,
  SUMMEN_FELDER,
  summenAenderung,
  type FeldAenderung,
  type StandSummen,
  type SummenFeld,
  type Wert,
  type ZeilenVergleich,
  type ZusammenfassungEintrag,
} from "@/lib/mieterstand";

type Format = (w: Wert) => string;

const vorzeichen = (d: Decimal, text: string) => (d.greaterThan(0) ? `+${text}` : text);

/** Wert mit Änderungskennzeichen: Farbe, Pfeil und Tooltip (alt, neu, Differenz). */
function Geaendert({ a, format, kinder, t, f, differenzFormat }: { a: FeldAenderung | null | undefined; format: Format; kinder: ReactNode; t: Texte; f: Formatierer; differenzFormat?: (d: Decimal) => string }) {
  if (!a) return <>{kinder}</>;
  const tm = t.mieterstand;
  const farbe = AENDERUNG_FARBE[a.wertung];
  const nachOben = a.differenz ? a.differenz.greaterThan(0) : a.wertung === "besser" ? true : a.wertung === "schlechter" ? false : null;
  const pfeil = nachOben === null ? "⇄" : nachOben ? "▲" : "▼";
  const teile = [fuelle(tm.tooltip, { wertung: tm.wertung[a.wertung], alt: format(a.alt), neu: format(a.neu) })];
  if (a.differenz) {
    const d = differenzFormat ?? ((x: Decimal) => f.betrag(x));
    teile.push(fuelle(tm.tooltipDifferenz, { betrag: vorzeichen(a.differenz, d(a.differenz)), prozent: a.prozent ? vorzeichen(a.prozent, f.prozent(a.prozent, 1)) : t.allgemein.unbekannt }));
  }
  const titel = teile.join(" · ");
  return (
    <span
      className="inline-flex items-baseline gap-1 whitespace-nowrap rounded px-1.5 py-0.5 ring-1 ring-inset"
      style={{ color: farbe.text, backgroundColor: farbe.hintergrund, ["--tw-ring-color" as string]: farbe.rand }}
      title={titel}
      data-aenderung={a.wertung}
      data-feld={a.feld}
    >
      <span aria-hidden className="text-[0.65rem]">
        {pfeil}
      </span>
      <span>{kinder}</span>
      <span className="sr-only">({titel})</span>
    </span>
  );
}

function Unbekannt({ t }: { t: Texte }) {
  return <span className="text-xs italic text-slate-400">{t.allgemein.unbekannt}</span>;
}

export function zusammenfassungText(eintraege: ZusammenfassungEintrag[], t: Texte, f: Formatierer) {
  const tm = t.mieterstand;
  return eintraege.map((e) => {
    const name = e.anzahl === 1 ? tm.ereignisse[e.art].eins : tm.ereignisse[e.art].mehr;
    const betrag = e.betrag && !e.betrag.isZero() ? fuelle(tm.proMonat, { betrag: vorzeichen(e.betrag, f.betragGanz(e.betrag)).replace("-", "−") }) : null;
    const zusatz = [betrag, e.unvollstaendig ? tm.teilweiseUnbekannt : null].filter(Boolean).join(", ");
    return { art: e.art, text: `${e.anzahl} ${name}${zusatz ? ` (${zusatz})` : ""}` };
  });
}

const TON: Record<ZusammenfassungEintrag["art"], "besser" | "schlechter" | "neutral"> = {
  mieterhoehung: "besser",
  neuvermietung: "besser",
  minderung: "schlechter",
  neuerLeerstand: "schlechter",
  mieterwechsel: "neutral",
  korrektur: "neutral",
};

export function StandVergleich({
  ansicht,
  t,
  f,
  pfad,
  erhalten,
  nurAenderungen,
  offen,
}: {
  ansicht: StandAnsicht;
  t: Texte;
  f: Formatierer;
  /** Seite, auf die das Auswahlformular zeigt */
  pfad: string;
  /** weitere Filter der Seite, die erhalten bleiben */
  erhalten: Record<string, string | undefined>;
  nurAenderungen: boolean;
  /** Tabelle aufgeklappt zeigen */
  offen: boolean;
}) {
  const tm = t.mieterstand;
  if (ansicht.stichtage.length === 0) {
    return (
      <Karte titel={tm.titel}>
        <p className="text-sm text-slate-500" data-keine-staende>
          {tm.keineStaende}
        </p>
      </Karte>
    );
  }
  const betrag: Format = (w) => (typeof w === "object" ? f.betrag(w) : String(w));
  const flaeche: Format = (w) => (typeof w === "object" ? f.flaeche(w) : String(w));
  const text: Format = (w) => (typeof w === "boolean" ? (w ? tm.status.leer : tm.status.vermietet) : typeof w === "object" ? w.toString() : w);
  const datum: Format = (w) => (typeof w === "string" ? f.datum(w) : String(w));
  const flaecheDiff = (d: Decimal) => f.flaeche(d);
  const mitVergleich = ansicht.vergleichStichtag !== null;
  const eintraege = zusammenfassungText(ansicht.zusammenfassung, t, f);

  const zeilenFilter = (v: ZeilenVergleich) => !nurAenderungen || istGeaendert(v);

  const zeile = (v: ZeilenVergleich) => {
    const z = v.neu ?? v.alt!;
    const a = v.aenderungen;
    const entfallen = !v.neu;
    const leer = z.leer;
    const zahlZelle = (wert: Decimal | null, feld: keyof typeof a, format: Format, jahr?: boolean, diff?: (d: Decimal) => string) =>
      wert === null ? (
        leer === true && feld !== "flaeche" ? "–" : <Unbekannt t={t} />
      ) : (
        <Geaendert a={a[feld]} format={format} t={t} f={f} differenzFormat={diff} kinder={jahr ? <span className="tabular-nums">{f.betrag(wert)}<span className="block text-xs opacity-75">{f.jahresmiete(wert)}</span></span> : format(wert)} />
      );
    return (
      <tr key={v.schluessel} data-stand-einheit={z.einheit} className={entfallen ? "text-slate-400 line-through" : undefined}>
        <td>
          <span className="font-medium">{z.einheit}</span>
          <div className="mt-0.5 flex items-center gap-1.5">
            <NutzungsartMarke art={z.art} t={t} />
            {v.ereignisse.includes("neu") && <Marke ton="neutral">{tm.neuImStand}</Marke>}
            {entfallen && <Marke ton="neutral">{tm.entfallen}</Marke>}
          </div>
        </td>
        <td>
          {leer === null ? (
            <Unbekannt t={t} />
          ) : (
            <Geaendert a={a.leer} format={text} t={t} f={f} kinder={<Marke ton={leer ? "warnung" : "gut"}>{leer ? tm.status.leer : tm.status.vermietet}</Marke>} />
          )}
        </td>
        <td>{leer === false ? z.mieter ? <Geaendert a={a.mieter} format={text} t={t} f={f} kinder={z.mieter} /> : <Unbekannt t={t} /> : "–"}</td>
        <td className="tabular-nums text-xs">
          {leer === false ? (
            <>
              {z.beginn ? <Geaendert a={a.beginn} format={datum} t={t} f={f} kinder={f.datum(z.beginn)} /> : <Unbekannt t={t} />}
              {z.ende && (
                <div>
                  – <Geaendert a={a.ende} format={datum} t={t} f={f} kinder={f.datum(z.ende)} />
                </div>
              )}
            </>
          ) : (
            "–"
          )}
        </td>
        <td className={rechts}>{z.art === "STELLPLATZ" ? `1 ${t.nutzung.stueck}` : zahlZelle(z.flaeche, "flaeche", flaeche, false, flaecheDiff)}</td>
        <td className={rechts}>
          {leer === true ? (
            z.erwarteteMiete ? (
              <span className="text-slate-500">
                <Geaendert a={a.erwarteteMiete} format={betrag} t={t} f={f} kinder={<span className="tabular-nums">{f.betrag(z.erwarteteMiete)}<span className="block text-xs">{f.jahresmiete(z.erwarteteMiete)} · {tm.erwartet}</span></span>} />
              </span>
            ) : (
              <Unbekannt t={t} />
            )
          ) : leer === false ? (
            zahlZelle(z.sollMiete, "sollMiete", betrag, true)
          ) : (
            <Unbekannt t={t} />
          )}
        </td>
        <td className={rechts}>{leer === false ? zahlZelle(z.istMiete, "istMiete", betrag, true) : leer === true ? "–" : <Unbekannt t={t} />}</td>
        <td className={rechts}>{leer === false && z.art !== "STELLPLATZ" ? zahlZelle(mieteJeQm(z), "mieteJeQm", betrag) : "–"}</td>
        <td className={rechts}>{leer === false ? zahlZelle(z.nebenkosten, "nebenkosten", betrag) : "–"}</td>
      </tr>
    );
  };

  const summenZeilen = (s: StandSummen, alt: StandSummen | null, titel: string, stichtag: string | null, quelle: string | null) => {
    const formate: Record<SummenFeld, (d: Decimal) => string> = {
      istMonat: (d) => f.betrag(d),
      sollMonat: (d) => f.betrag(d),
      flaeche: (d) => f.flaeche(d),
      leerFlaeche: (d) => f.flaeche(d),
      leerQuote: (d) => f.prozent(d, 1),
      entgangenMonat: (d) => f.betrag(d),
    };
    return (
      <tr data-summen={titel} className="bg-slate-50 align-top">
        <td colSpan={9} className="!py-3">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{titel}</div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
            {SUMMEN_FELDER.map((feld) => {
              const wert = s[feld];
              const aend = alt ? summenAenderung(feld, alt[feld], wert) : null;
              const fmt = formate[feld];
              const anzeige =
                wert.wert === null ? (
                  <Unbekannt t={t} />
                ) : (
                  <Geaendert
                    a={aend}
                    format={(w) => (typeof w === "object" ? fmt(w) : String(w))}
                    differenzFormat={feld === "leerQuote" ? (d) => `${f.zahl(d, 1)} %-Pkt.` : fmt}
                    t={t}
                    f={f}
                    kinder={
                      <span className="tabular-nums">
                        {fmt(wert.wert)}
                        {(feld === "istMonat" || feld === "sollMonat" || feld === "entgangenMonat") && <span className="block text-xs opacity-75">{f.betrag(jahresNettokaltmiete(wert.wert))} / {t.allgemein.jahr}</span>}
                      </span>
                    }
                  />
                );
              return (
                <div key={feld} data-summe={feld}>
                  <dt className="text-xs text-slate-500">{tm.summen[feld]}</dt>
                  <dd className="font-medium">
                    <MitHerleitung
                      wert={anzeige}
                      t={t}
                      herleitung={{
                        berechnung: tm.herleitung[feld],
                        werte: alt && alt[feld].wert !== null ? [[tm.vergleichswert, fmt(alt[feld].wert!)]] : undefined,
                        quelle: quelle ?? undefined,
                        stichtag: stichtag ?? undefined,
                        hinweis: wert.unvollstaendig ? tm.unvollstaendig : undefined,
                      }}
                    />
                    {wert.unvollstaendig && wert.wert !== null && <span className="ml-1 text-xs font-normal text-amber-700">({t.allgemein.unvollstaendig})</span>}
                  </dd>
                </div>
              );
            })}
          </dl>
        </td>
      </tr>
    );
  };

  const haus = (h: HausVergleich) => {
    const zeilen = h.zeilen.filter(zeilenFilter);
    if (nurAenderungen && zeilen.length === 0) return null;
    return (
      <Fragment key={h.hausId}>
        <tr data-stand-haus={h.haus}>
          <td colSpan={9} className="!border-t-2 !border-slate-200 bg-white !pt-4">
            <span className="font-semibold text-slate-900">{h.haus}</span>
            <span className="ml-2 text-xs text-slate-500">
              {fuelle(tm.standHaus, { datum: f.datum(h.stand.stichtag) })}
              {mitVergleich && ` · ${h.vergleich ? fuelle(tm.vergleichHaus, { datum: f.datum(h.vergleich.stichtag) }) : tm.keinVergleichsstand}`} · {tm.quelle}: {h.stand.quelle}
            </span>
            {h.stand.art === "NUR_LEERSTAND" && (
              <span className="ml-2">
                <Marke ton="warnung">{tm.arten.NUR_LEERSTAND}</Marke>
              </span>
            )}
          </td>
        </tr>
        {zeilen.length === 0 ? (
          <tr>
            <td colSpan={9} className="text-sm text-slate-500">
              {tm.keineZeilen}
            </td>
          </tr>
        ) : (
          zeilen.map(zeile)
        )}
        {summenZeilen(h.summen, h.summenVergleich, fuelle(tm.summeHaus, { haus: h.haus }), f.datum(h.stand.stichtag), h.stand.quelle)}
      </Fragment>
    );
  };

  const sichtbar = ansicht.haeuser.map(haus).filter(Boolean);

  return (
    <Karte titel={tm.titel}>
      <form method="get" action={pfad} className="flex flex-wrap items-end gap-3 text-sm" data-stand-auswahl>
        {Object.entries(erhalten).map(([k, w]) => (w ? <input key={k} type="hidden" name={k} value={w} /> : null))}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600">{tm.standVom}</span>
          <select name="stand" defaultValue={ansicht.stichtag ?? ""} className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5">
            {ansicht.stichtage.map((s) => (
              <option key={s} value={s}>
                {f.datum(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-slate-600">{tm.vergleichenMit}</span>
          <select name="vergleich" defaultValue={ansicht.vergleichStichtag ?? "keiner"} className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5">
            <option value="keiner">{tm.keinVergleich}</option>
            {ansicht.stichtage.map((s) => (
              <option key={s} value={s}>
                {f.datum(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-1.5">
          <input type="checkbox" name="nur" value="1" defaultChecked={nurAenderungen} className="h-4 w-4 rounded border-slate-300" />
          {tm.nurAenderungen}
        </label>
        <button className={knopfKlasse("sekundaer")}>{tm.anzeigen}</button>
      </form>

      <div className="mt-3 text-sm" data-stand-zusammenfassung>
        {!mitVergleich ? (
          <span className="text-slate-500">{tm.ohneVergleich}</span>
        ) : eintraege.length === 0 ? (
          <span className="text-slate-500">{tm.keineAenderungen}</span>
        ) : (
          <>
            <span className="text-slate-600">{fuelle(tm.gegenueber, { datum: f.datum(ansicht.vergleichStichtag) })} </span>
            {eintraege.map((e, i) => {
              const farbe = AENDERUNG_FARBE[TON[e.art]];
              return (
                <Fragment key={e.art}>
                  {i > 0 && ", "}
                  <span className="font-medium" style={{ color: farbe.text }} data-ereignis={e.art}>
                    {e.text}
                  </span>
                </Fragment>
              );
            })}
          </>
        )}
      </div>
      {ansicht.abweichendeStichtage && <p className="mt-2 text-xs text-slate-500">{tm.abweichend}</p>}
      {ansicht.haeuser.some((h) => h.stand.art === "NUR_LEERSTAND") && <p className="mt-2 text-xs text-amber-700">{tm.nurLeerstandHinweis}</p>}

      <details className="mt-4" open={offen} data-stand-tabelle>
        <summary className="cursor-pointer text-sm text-sky-700">{tm.tabelle}</summary>
        <p className="mt-2 text-xs text-slate-500">{tm.legende}</p>
        {sichtbar.length === 0 ? (
          <Leer>{nurAenderungen ? tm.keineAenderungen : tm.keineZeilen}</Leer>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full border-collapse text-sm [&_td]:border-t [&_td]:border-slate-100 [&_td]:px-3 [&_td]:py-2 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-slate-500">
              <thead>
                <tr>
                  <th>{tm.spalten.einheit}</th>
                  <th>{tm.spalten.status}</th>
                  <th>{tm.spalten.mieter}</th>
                  <th>{tm.spalten.zeitraum}</th>
                  <th className={rechts}>{tm.spalten.flaeche}</th>
                  <th className={rechts}>
                    {tm.spalten.soll} ({t.allgemein.monat} / {t.allgemein.jahr})
                  </th>
                  <th className={rechts}>
                    {tm.spalten.ist} ({t.allgemein.monat} / {t.allgemein.jahr})
                  </th>
                  <th className={rechts}>{tm.spalten.jeQm}</th>
                  <th className={rechts}>{tm.spalten.nebenkosten}</th>
                </tr>
              </thead>
              <tbody>
                {sichtbar}
                {ansicht.haeuser.length > 1 && ansicht.summen && summenZeilen(ansicht.summen, ansicht.summenVergleich, tm.summeAlle, f.datum(ansicht.stichtag), null)}
              </tbody>
            </table>
          </div>
        )}
      </details>
    </Karte>
  );
}
