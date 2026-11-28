"use client";

import { startTransition, useActionState, useState } from "react";
import type { Texte } from "@/i18n";
import { fuelle } from "@/i18n";
import { Auswahl, Feld, Felder, Marke, Tabelle, knopfKlasse, type Ton } from "@/components/ui";
import { formatierer } from "@/lib/format";
import type { Aenderung, PlanAktion, PlanZeile } from "@/lib/import/mieterliste";
import { mieterlisteUebernehmen, mieterlisteVorschau, type MieterVorschau, type MieterVorschauErgebnis } from "./aktionen";
import type { Nutzungsart } from "@/lib/nutzungsart";

export const AKTION_TON: Record<PlanAktion, Ton> = {
  neu: "gut",
  aendern: "warnung",
  mieterwechsel: "warnung",
  auszug: "warnung",
  unveraendert: "neutral",
  fehler: "schlecht",
};

type Formatierer = ReturnType<typeof formatierer>;

function wert(a: Aenderung, w: string | null, f: Formatierer, t: Texte) {
  if (w === null) return "–";
  if (a.feld === "beginn" || a.feld === "ende" || a.feld === "letzteMieterhoehung") return f.datum(w);
  if (a.feld === "flaeche") return f.flaeche(w);
  if (a.feld === "art") return t.einheitArten[w as Nutzungsart];
  return f.betrag(w);
}

function Details({ z, f, t }: { z: PlanZeile; f: Formatierer; t: Texte }) {
  const ti = t.importe;
  const zeilen: string[] = [];
  if (z.fehler) zeilen.push(fuelle(ti.planFehler[z.fehler], { feld: z.fehlerFeld ? ti.spalten[z.fehlerFeld] : "" }));
  if (z.neueEinheit) zeilen.push(fuelle(ti.neueEinheit, { art: t.einheitArten[z.neueEinheit.art], flaeche: f.flaeche(z.neueEinheit.flaeche) }));
  for (const a of [...z.einheitAenderungen, ...(z.aktualisieren?.aenderungen ?? [])]) {
    const name = ti.spalten[a.feld];
    const neu = wert(a, a.neu, f, t);
    const jahr = a.feld === "sollMiete" || a.feld === "istMiete" ? ` (${t.allgemein.jahr} ${f.jahresmiete(a.neu ?? 0)})` : "";
    zeilen.push(`${name}: ${wert(a, a.alt, f, t)} → ${neu}${jahr}`);
  }
  if (z.beenden) zeilen.push(fuelle(ti.endetAm, { mieter: z.beenden.mieterName, datum: f.datum(z.beenden.ende) }));
  if (z.anlegen) {
    zeilen.push(
      fuelle(ti.neuerMieter, { mieter: z.anlegen.mieterName, datum: f.datum(z.anlegen.beginn), soll: f.betrag(z.anlegen.sollMiete) }) +
        ` (${t.allgemein.jahr} ${f.jahresmiete(z.anlegen.sollMiete)})`,
    );
  }
  if (zeilen.length === 0) return <span className="text-slate-400">–</span>;
  return (
    <ul className="space-y-0.5">
      {zeilen.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

function Vorschau({ v, t, mandant, verwerfen }: { v: MieterVorschau; t: Texte; mandant: { waehrung: string; sprache: string }; verwerfen: () => void }) {
  const f = formatierer(mandant);
  const ti = t.importe;
  const [ergebnis, uebernehmen, laeuft] = useActionState(mieterlisteUebernehmen, {});
  const [nurAenderungen, setNurAenderungen] = useState(true);
  const aenderungen = v.anzahl.neu + v.anzahl.aendern + v.anzahl.mieterwechsel + v.anzahl.auszug;
  const sichtbar = nurAenderungen ? v.zeilen.filter((z) => z.aktion !== "unveraendert") : v.zeilen;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">
          {v.hausName} · {v.dateiname} · {ti.stand} {f.datum(v.stand)}
        </span>
        {(Object.keys(v.anzahl) as PlanAktion[])
          .filter((a) => v.anzahl[a] > 0)
          .map((a) => (
            <Marke key={a} ton={AKTION_TON[a]}>
              {v.anzahl[a]} {ti.aktionen[a]}
            </Marke>
          ))}
      </div>
      <p className="text-xs text-slate-500">
        {ti.erkannteSpalten}: {v.spalten.map((s) => ti.spalten[s]).join(", ")}
      </p>
      {v.fehlendeEinheiten.length > 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">{fuelle(ti.fehlendeEinheiten, { einheiten: v.fehlendeEinheiten.join(", ") })}</p>
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={!nurAenderungen} onChange={(e) => setNurAenderungen(!e.target.checked)} className="h-4 w-4" />
        {fuelle(ti.unveraenderteZeigen, { anzahl: v.anzahl.unveraendert })}
      </label>
      {sichtbar.length > 0 && (
        <Tabelle>
          <thead>
            <tr>
              <th>{ti.zeile}</th>
              <th>{ti.einheit}</th>
              <th>{ti.mieter}</th>
              <th>{ti.ergebnis}</th>
              <th>{ti.details}</th>
            </tr>
          </thead>
          <tbody>
            {sichtbar.map((z) => (
              <tr key={z.zeile} className="align-top">
                <td className="tabular-nums text-slate-500">{z.zeile}</td>
                <td className="font-medium">{z.einheit}</td>
                <td>{z.mieter ?? "–"}</td>
                <td>
                  <Marke ton={AKTION_TON[z.aktion]}>{ti.aktionen[z.aktion]}</Marke>
                </td>
                <td>
                  <Details z={z} f={f} t={t} />
                </td>
              </tr>
            ))}
          </tbody>
        </Tabelle>
      )}
      {v.anzahl.fehler > 0 && <p className="text-sm text-red-700">{ti.fehlerUebersprungen}</p>}
      {ergebnis.ok ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-emerald-700">{ergebnis.ok}</span>
          <button type="button" onClick={verwerfen} className={knopfKlasse("sekundaer")}>
            {ti.verwerfen}
          </button>
        </div>
      ) : (
        <form
          className="flex flex-wrap items-center gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(() => uebernehmen(fd));
          }}
        >
          <input type="hidden" name="hausId" value={v.hausId} />
          <input type="hidden" name="stand" value={v.stand} />
          <input type="hidden" name="dateiname" value={v.dateiname} />
          <input type="hidden" name="text" value={v.text} />
          {aenderungen > 0 ? (
            <button type="submit" disabled={laeuft} className={knopfKlasse("primaer")}>
              {fuelle(ti.uebernehmen, { anzahl: aenderungen })}
            </button>
          ) : (
            <span className="text-sm text-slate-600">{ti.nichtsZuTun}</span>
          )}
          <button type="button" onClick={verwerfen} className={knopfKlasse("sekundaer")}>
            {ti.verwerfen}
          </button>
          {ergebnis.fehler && <span role="alert" className="text-sm text-red-700">{ergebnis.fehler}</span>}
        </form>
      )}
    </div>
  );
}

function Hochladen({
  t,
  haeuser,
  heute,
  mandant,
  hausVorwahl,
}: {
  t: Texte;
  haeuser: Array<{ id: string; bezeichnung: string }>;
  heute: string;
  mandant: { waehrung: string; sprache: string };
  hausVorwahl: string | null;
}) {
  const ti = t.importe;
  const [ergebnis, pruefen, laeuft] = useActionState<MieterVorschauErgebnis, FormData>(mieterlisteVorschau, {});
  const [schluessel, setSchluessel] = useState(0);
  const [aktiv, setAktiv] = useState(false);
  const [hausId, setHausId] = useState(hausVorwahl ?? haeuser[0]?.id ?? "");

  if (aktiv && laeuft) return <p className="text-sm text-slate-500">{t.allgemein.laden}</p>;
  if (aktiv && ergebnis.vorschau) {
    return <Vorschau key={schluessel} v={ergebnis.vorschau} t={t} mandant={mandant} verwerfen={() => setAktiv(false)} />;
  }
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setSchluessel((s) => s + 1);
        setAktiv(true);
        startTransition(() => pruefen(fd));
      }}
    >
      <Felder>
        <div onChange={(e) => setHausId((e.target as unknown as HTMLSelectElement).value)}>
          <Auswahl name="hausId" label={ti.haus} optionen={haeuser.map((h) => ({ wert: h.id, text: h.bezeichnung }))} wert={hausId} pflicht />
        </div>
        <Feld name="stand" label={ti.stand} typ="date" wert={heute} pflicht hinweis={ti.standHinweis} />
        <Feld name="datei" label={ti.datei} typ="file" accept=".csv,text/csv,text/plain" pflicht breit />
      </Felder>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={laeuft} className={knopfKlasse("primaer")}>
          {ti.vorschau}
        </button>
        {hausId && (
          <a href={`/api/import/mieterliste?haus=${encodeURIComponent(hausId)}`} className="text-sm text-slate-700 underline hover:text-slate-900">
            {ti.vorlage}
          </a>
        )}
        {aktiv && ergebnis.fehler && !laeuft && (
          <span role="alert" className="text-sm text-red-700">
            {ergebnis.fehler}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500">{ti.vorlageHinweis}</p>
    </form>
  );
}

export function MieterImport(props: Parameters<typeof Hochladen>[0]) {
  return <Hochladen {...props} />;
}
