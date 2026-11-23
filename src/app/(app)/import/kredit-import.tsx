"use client";

import { startTransition, useActionState, useState } from "react";
import { fuelle, type Texte } from "@/i18n";
import { Feld, Marke, Tabelle, knopfKlasse, rechts } from "@/components/ui";
import { formatierer } from "@/lib/format";
import {
  kreditbuchungenUebernehmen,
  kreditbuchungenVorschau,
  type DateiVorschau,
  type KreditVorschauErgebnis,
} from "./aktionen";

type KreditOption = { id: string; text: string };

function DateiKarte({
  d,
  kreditId,
  setKreditId,
  kredite,
  t,
  f,
}: {
  d: DateiVorschau;
  kreditId: string;
  setKreditId: (id: string) => void;
  kredite: KreditOption[];
  t: Texte;
  f: ReturnType<typeof formatierer>;
}) {
  const ti = t.importe;
  const von = d.buchungen[0]?.datum;
  const bis = d.buchungen.at(-1)?.datum;
  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium">{d.dateiname}</div>
          <div className="text-xs text-slate-500">
            {[d.iban, d.kreditnummer, d.aufbau, von && bis ? fuelle(ti.zeitraum, { von: f.datum(von), bis: f.datum(bis) }) : null]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {d.neu > 0 && <Marke ton="gut">{d.neu} {ti.neu}</Marke>}
          {d.doppelt > 0 && <Marke>{d.doppelt} {ti.dublette}</Marke>}
          {d.unlesbar.length > 0 && <Marke ton="schlecht">{d.unlesbar.length} {ti.aktionen.fehler}</Marke>}
        </div>
      </div>
      {d.ohneTabelle ? (
        <p className="mt-2 text-sm text-red-700">{fuelle(ti.keineTabelleBank, { datei: d.dateiname })}</p>
      ) : (
        <>
          <label className="mt-3 block max-w-md text-sm">
            <span className="font-medium text-slate-700">{ti.kredit}</span>
            <select
              value={kreditId}
              onChange={(e) => setKreditId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm"
            >
              <option value="">{ti.kreditWaehlen}</option>
              {kredite.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.text}
                </option>
              ))}
            </select>
            <span className={`mt-1 block text-xs ${d.kreditId ? "text-slate-500" : "text-amber-700"}`}>
              {d.kreditId && d.erkanntUeber && d.erkanntUeber !== "auswahl"
                ? fuelle(ti.kreditErkannt, { merkmal: d.erkanntUeber === "iban" ? "IBAN" : ti.kreditnummer })
                : !d.kreditId
                  ? ti.kreditNichtErkannt
                  : null}
            </span>
          </label>
          {d.unlesbar.length > 0 && (
            <p className="mt-2 text-sm text-red-700">
              {fuelle(ti.unlesbareZeilen, { anzahl: d.unlesbar.length, zeilen: d.unlesbar.slice(0, 10).join(", ") })}
            </p>
          )}
          {d.buchungen.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-slate-700">{fuelle(ti.buchungenAnzahl, { neu: d.neu, doppelt: d.doppelt })}</summary>
              <div className="mt-2 max-h-96 overflow-y-auto">
                <Tabelle>
                  <thead>
                    <tr>
                      <th>{ti.datum}</th>
                      <th>{ti.art}</th>
                      <th className={rechts}>{ti.betrag}</th>
                      <th className={rechts}>{ti.saldo}</th>
                      <th>{ti.text}</th>
                      <th>{ti.ergebnis}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.buchungen.map((b) => (
                      <tr key={b.zeile}>
                        <td>{f.datum(b.datum)}</td>
                        <td>{t.buchungsArten[b.art]}</td>
                        <td className={rechts}>{f.betrag(b.betrag)}</td>
                        <td className={rechts}>{f.betrag(b.saldoNach)}</td>
                        <td className="max-w-xs truncate text-slate-500">{b.text}</td>
                        <td>{b.neu ? <Marke ton="gut">{ti.neu}</Marke> : <Marke>{ti.dublette}</Marke>}</td>
                      </tr>
                    ))}
                  </tbody>
                </Tabelle>
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}

function Vorschau({
  dateien,
  kredite,
  t,
  mandant,
  neuPruefen,
  verwerfen,
  pruefenLaeuft,
}: {
  dateien: DateiVorschau[];
  kredite: KreditOption[];
  t: Texte;
  mandant: { waehrung: string; sprache: string };
  neuPruefen: (fd: FormData) => void;
  verwerfen: () => void;
  pruefenLaeuft: boolean;
}) {
  const ti = t.importe;
  const f = formatierer(mandant);
  const [auswahl, setAuswahl] = useState<Record<string, string>>(() =>
    Object.fromEntries(dateien.map((d, i) => [String(i), d.kreditId ?? ""])),
  );
  const [ergebnis, uebernehmen, laeuft] = useActionState(kreditbuchungenUebernehmen, {});
  const geaendert = dateien.some((d, i) => (d.kreditId ?? "") !== auswahl[String(i)]);
  const json = JSON.stringify(dateien.map((d, i) => ({ dateiname: d.dateiname, text: d.text, kreditId: auswahl[String(i)] || null })));
  const neu = dateien.reduce((s, d) => s + d.neu, 0);
  const formDaten = () => {
    const fd = new FormData();
    fd.set("dateienJson", json);
    return fd;
  };

  return (
    <div className="space-y-3">
      {dateien.map((d, i) => (
        <DateiKarte
          key={`${d.dateiname}-${i}`}
          d={d}
          kreditId={auswahl[String(i)]}
          setKreditId={(id) => setAuswahl((a) => ({ ...a, [String(i)]: id }))}
          kredite={kredite}
          t={t}
          f={f}
        />
      ))}
      <div className="flex flex-wrap items-center gap-3">
        {ergebnis.ok ? (
          <span className="text-sm text-emerald-700">{ergebnis.ok}</span>
        ) : geaendert ? (
          <button type="button" disabled={pruefenLaeuft} onClick={() => neuPruefen(formDaten())} className={knopfKlasse("primaer")}>
            {ti.vorschau}
          </button>
        ) : neu > 0 ? (
          <button type="button" disabled={laeuft} onClick={() => startTransition(() => uebernehmen(formDaten()))} className={knopfKlasse("primaer")}>
            {fuelle(ti.uebernehmenBuchungen, { anzahl: neu })}
          </button>
        ) : (
          <span className="text-sm text-slate-600">{ti.nichtsZuTun}</span>
        )}
        <button type="button" onClick={verwerfen} className={knopfKlasse("sekundaer")}>
          {ti.verwerfen}
        </button>
        {ergebnis.fehler && <span role="alert" className="text-sm text-red-700">{ergebnis.fehler}</span>}
      </div>
    </div>
  );
}

export function KreditImport({ t, kredite, mandant }: { t: Texte; kredite: KreditOption[]; mandant: { waehrung: string; sprache: string } }) {
  const ti = t.importe;
  const [ergebnis, pruefen, laeuft] = useActionState<KreditVorschauErgebnis, FormData>(kreditbuchungenVorschau, {});
  const [aktiv, setAktiv] = useState(false);
  const [runde, setRunde] = useState(0);
  const starte = (fd: FormData) => {
    setAktiv(true);
    setRunde((r) => r + 1);
    startTransition(() => pruefen(fd));
  };

  if (aktiv && laeuft) return <p className="text-sm text-slate-500">{t.allgemein.laden}</p>;
  if (aktiv && ergebnis.dateien) {
    return (
      <Vorschau
        key={runde}
        dateien={ergebnis.dateien}
        kredite={kredite}
        t={t}
        mandant={mandant}
        neuPruefen={starte}
        verwerfen={() => setAktiv(false)}
        pruefenLaeuft={laeuft}
      />
    );
  }
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        starte(new FormData(e.currentTarget));
      }}
    >
      <Feld name="dateien" label={ti.dateien} typ="file" accept=".csv,text/csv,text/plain" multiple pflicht />
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={laeuft} className={knopfKlasse("primaer")}>
          {ti.vorschau}
        </button>
        {aktiv && ergebnis.fehler && !laeuft && (
          <span role="alert" className="text-sm text-red-700">
            {ergebnis.fehler}
          </span>
        )}
      </div>
    </form>
  );
}
