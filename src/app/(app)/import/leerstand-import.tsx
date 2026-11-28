"use client";

import { startTransition, useActionState, useState } from "react";
import { Feld, Felder, Marke, Tabelle, knopfKlasse, rechts, type Ton } from "@/components/ui";
import { fuelle, type Texte } from "@/i18n";
import { formatierer } from "@/lib/format";
import type { ZeilenStatus } from "@/lib/import/leerstandsliste";
import { leerstandUebernehmen, leerstandVorschau, type LeerstandVorschau, type LeerstandVorschauErgebnis } from "./leerstand-aktionen";

const STATUS_TON: Record<ZeilenStatus, Ton> = { zugeordnet: "gut", ki: "warnung", hausUnbekannt: "schlecht", einheitUnbekannt: "schlecht", ohneStichtag: "schlecht", doppelt: "neutral" };

function Vorschau({ v, t, mandant, neuPruefen, verwerfen, laeuftPruefen }: { v: LeerstandVorschau; t: Texte; mandant: { waehrung: string; sprache: string }; neuPruefen: (fd: FormData) => void; verwerfen: () => void; laeuftPruefen: boolean }) {
  const f = formatierer(mandant);
  const tl = t.leerstandImport;
  const [ergebnis, uebernehmen, laeuft] = useActionState(leerstandUebernehmen, {});
  const offen = v.zeilen.filter((z) => z.status !== "zugeordnet" && z.status !== "ki").length;
  const zuordnungen = JSON.stringify(v.zuordnungen);
  const hausAuswahl = v.hausTexte.map((h) => (
    <label key={h.text} className="flex flex-wrap items-center gap-2 text-sm">
      <span className="min-w-56 font-medium">{h.text}</span>
      <select name={`haus:${h.text}`} defaultValue={h.hausId ?? ""} className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5" data-haus-text={h.text}>
        <option value="">{tl.nichtZuordnen}</option>
        {v.haeuser.map((x) => (
          <option key={x.id} value={x.id}>
            {x.bezeichnung}
          </option>
        ))}
      </select>
      {h.ki && <Marke ton="warnung">{tl.status.ki}</Marke>}
    </label>
  ));

  return (
    <div className="space-y-5">
      <div className="text-sm">
        <span className="font-medium">{v.dateiname}</span>
        <span className="ml-2 text-xs text-slate-500">
          {t.importe.erkannteSpalten}: {v.spalten.join(", ")}
        </span>
      </div>
      {v.ki !== "nichtGefragt" && (
        <p className={`rounded-md px-3 py-2 text-sm ${v.ki === "genutzt" ? "bg-amber-50 text-amber-800" : "bg-slate-50 text-slate-600"}`} data-ki-status={v.ki}>
          {fuelle(tl.ki[v.ki], { modell: v.kiHinweis ?? "", meldung: v.kiHinweis ?? "" })}
        </p>
      )}

      {v.hausTexte.length > 0 && (
        <form
          className="space-y-2 rounded-lg border border-slate-200 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(() => neuPruefen(fd));
          }}
        >
          <div className="text-sm font-medium">{tl.hausZuordnung}</div>
          <p className="text-xs text-slate-500">{tl.hausZuordnungHinweis}</p>
          <input type="hidden" name="text" value={v.text} />
          <input type="hidden" name="dateiname" value={v.dateiname} />
          <input type="hidden" name="zuordnungen" value={zuordnungen} />
          {hausAuswahl}
          <button type="submit" disabled={laeuftPruefen} className={knopfKlasse("sekundaer")}>
            {tl.neuPruefen}
          </button>
        </form>
      )}

      <Tabelle>
        <thead>
          <tr>
            <th>{tl.spalten.zeile}</th>
            <th>{tl.spalten.haus}</th>
            <th>{tl.spalten.einheit}</th>
            <th>{tl.spalten.stichtag}</th>
            <th className={rechts}>{tl.spalten.flaeche}</th>
            <th className={rechts}>{tl.spalten.erwartet}</th>
            <th>{tl.spalten.status}</th>
          </tr>
        </thead>
        <tbody>
          {v.zeilen.map((z) => (
            <tr key={z.zeile} data-leerstand-zeile={z.einheit} data-status={z.status}>
              <td className="tabular-nums text-slate-500">{z.zeile}</td>
              <td>
                {z.haus ?? "–"}
                {z.hausText && z.hausText !== z.haus && <div className="text-xs text-slate-500">{z.hausText}</div>}
              </td>
              <td>
                {z.einheitName ?? "–"}
                {z.einheit !== z.einheitName && <div className="text-xs text-slate-500">{z.einheit}</div>}
              </td>
              <td>{z.stichtag ? f.datum(z.stichtag) : "–"}</td>
              <td className={rechts}>{z.flaeche ? f.flaeche(z.flaeche) : "–"}</td>
              <td className={rechts}>
                {z.erwarteteMiete ? (
                  <>
                    {f.betrag(z.erwarteteMiete)}
                    <div className="text-xs text-slate-500">{f.jahresmiete(z.erwarteteMiete)}</div>
                  </>
                ) : (
                  t.allgemein.unbekannt
                )}
              </td>
              <td>
                <Marke ton={STATUS_TON[z.status]}>{tl.status[z.status]}</Marke>
              </td>
            </tr>
          ))}
        </tbody>
      </Tabelle>
      {offen > 0 && <p className="text-sm text-amber-700">{fuelle(tl.zeilenOffen, { anzahl: offen })}</p>}

      {ergebnis.ok ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-emerald-700" data-leerstand-ergebnis>
            {ergebnis.ok}
          </span>
          <button type="button" onClick={verwerfen} className={knopfKlasse("sekundaer")}>
            {t.importe.verwerfen}
          </button>
        </div>
      ) : (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(() => uebernehmen(fd));
          }}
        >
          <input type="hidden" name="text" value={v.text} />
          <input type="hidden" name="dateiname" value={v.dateiname} />
          <input type="hidden" name="zuordnungen" value={zuordnungen} />
          {v.hausTexte.map((h) => (
            <input key={h.text} type="hidden" name={`haus:${h.text}`} value={h.hausId ?? ""} />
          ))}
          <div className="text-sm font-medium">{tl.gruppen}</div>
          <p className="text-xs text-slate-500">{tl.gruppenHinweis}</p>
          <ul className="space-y-1 text-sm">
            {v.gruppen.map((g) => (
              <li key={g.schluessel}>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="gruppe" value={g.schluessel} defaultChecked={!g.konflikt} disabled={!!g.konflikt} className="h-4 w-4" />
                  <span>
                    {g.haus} · {f.datum(g.stichtag)} · {g.anzahl} {tl.spalten.anzahl}
                  </span>
                  {g.konflikt && <span className="text-xs text-slate-500">({tl.konflikt[g.konflikt]})</span>}
                </label>
              </li>
            ))}
          </ul>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="vollstaendig" value="1" className="mt-0.5 h-4 w-4" />
            <span>
              {tl.vollstaendig}
              <span className="block text-xs text-slate-500">{tl.vollstaendigHinweis}</span>
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={laeuft || v.gruppen.every((g) => g.konflikt)} className={knopfKlasse("primaer")}>
              {tl.uebernehmen}
            </button>
            <button type="button" onClick={verwerfen} className={knopfKlasse("sekundaer")}>
              {t.importe.verwerfen}
            </button>
            {ergebnis.fehler && (
              <span role="alert" className="text-sm text-red-700">
                {ergebnis.fehler}
              </span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

export function LeerstandImport({ t, mandant }: { t: Texte; mandant: { waehrung: string; sprache: string } }) {
  const tl = t.leerstandImport;
  const [ergebnis, pruefen, laeuft] = useActionState<LeerstandVorschauErgebnis, FormData>(leerstandVorschau, {});
  const [aktiv, setAktiv] = useState(false);
  const [schluessel, setSchluessel] = useState(0);

  if (aktiv && ergebnis.vorschau) {
    return (
      <Vorschau
        key={schluessel}
        v={ergebnis.vorschau}
        t={t}
        mandant={mandant}
        laeuftPruefen={laeuft}
        neuPruefen={(fd) => {
          setSchluessel((s) => s + 1);
          pruefen(fd);
        }}
        verwerfen={() => setAktiv(false)}
      />
    );
  }
  if (aktiv && laeuft) return <p className="text-sm text-slate-500">{t.allgemein.laden}</p>;
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setAktiv(true);
        setSchluessel((s) => s + 1);
        startTransition(() => pruefen(fd));
      }}
    >
      <p className="text-sm text-slate-600">{tl.beschreibung}</p>
      <Felder>
        <Feld name="datei" label={t.importe.datei} typ="file" accept=".csv,text/csv,text/plain" pflicht breit />
      </Felder>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="ki" value="1" className="h-4 w-4" />
        {tl.kiFragen}
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={laeuft} className={knopfKlasse("primaer")}>
          {t.importe.vorschau}
        </button>
        {ergebnis.fehler && (
          <span role="alert" className="text-sm text-red-700">
            {ergebnis.fehler}
          </span>
        )}
      </div>
    </form>
  );
}
