import { Formular } from "@/components/formular";
import { Auswahl, Feld, Felder, Textfeld } from "@/components/ui";
import type { Texte } from "@/i18n";
import { isoDatum } from "@/lib/datum";
import type { Formatierer } from "@/lib/format";
import { SICHERHEIT_ARTEN, SICHERHEIT_QUELLEN, type SicherheitArt, type SicherheitQuelle } from "@/lib/sicherheit";
import { sicherheitSpeichern } from "./aktionen";

export type SicherheitStart = {
  id: string | null;
  art: SicherheitArt;
  glaeubiger: string | null;
  betrag: unknown;
  rang: number | null;
  fundstelle: string | null;
  sicherungsgeber: string | null;
  gesellschaftId: string | null;
  eingetragenAm: Date | null;
  gueltigBis: Date | null;
  geloeschtAm: Date | null;
  quelle: SicherheitQuelle;
  stand: Date | null;
  dokumentId: string | null;
  notiz: string | null;
  hausIds: string[];
  kreditIds: string[];
};

function Haken({ name, titel, optionen, gewaehlt }: { name: string; titel: string; optionen: Array<{ wert: string; text: string }>; gewaehlt: string[] }) {
  return (
    <fieldset className="text-sm">
      <legend className="font-medium text-slate-700">{titel}</legend>
      <div className="mt-1 grid max-h-56 gap-1 overflow-y-auto rounded-md border border-slate-200 p-2 sm:grid-cols-2">
        {optionen.map((o) => (
          <label key={o.wert} className="flex items-center gap-2">
            <input type="checkbox" name={name} value={o.wert} defaultChecked={gewaehlt.includes(o.wert)} />
            {o.text}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function SicherheitFormular({
  start,
  t,
  f,
  haeuser,
  kredite,
  gesellschaften,
  dokumente,
}: {
  start: SicherheitStart;
  t: Texte;
  f: Formatierer;
  haeuser: Array<{ id: string; bezeichnung: string }>;
  kredite: Array<{ id: string; bezeichnung: string; bank: string | null }>;
  gesellschaften: Array<{ id: string; name: string }>;
  dokumente: Array<{ id: string; titel: string }>;
}) {
  const ts = t.sicherheiten;
  const tf = ts.felder;
  const d = (x: Date | null) => (x ? isoDatum(x) : null);
  return (
    <Formular aktion={sicherheitSpeichern.bind(null, start.id)} absenden={ts.speichern}>
      <Felder>
        <Auswahl name="art" label={tf.art} wert={start.art} pflicht optionen={SICHERHEIT_ARTEN.map((a) => ({ wert: a, text: ts.arten[a] }))} />
        <Feld name="glaeubiger" label={tf.glaeubiger} wert={start.glaeubiger} pflicht />
        <Feld name="betrag" label={tf.betrag} wert={start.betrag == null ? null : f.eingabe(String(start.betrag), 2)} inputMode="decimal" />
        <Feld name="rang" label={tf.rang} wert={start.rang?.toString()} inputMode="numeric" />
        <Feld name="fundstelle" label={tf.fundstelle} wert={start.fundstelle} hinweis={tf.fundstelleHinweis} breit />
        <Feld name="sicherungsgeber" label={tf.sicherungsgeber} wert={start.sicherungsgeber} />
        <Auswahl name="gesellschaftId" label={tf.gesellschaft} wert={start.gesellschaftId} leerText={ts.keineAuswahl} optionen={gesellschaften.map((g) => ({ wert: g.id, text: g.name }))} />
        <Feld name="eingetragenAm" label={tf.eingetragenAm} typ="date" wert={d(start.eingetragenAm)} />
        <Feld name="gueltigBis" label={tf.gueltigBis} typ="date" wert={d(start.gueltigBis)} />
        <Feld name="geloeschtAm" label={tf.geloeschtAm} typ="date" wert={d(start.geloeschtAm)} />
        <Auswahl name="quelle" label={tf.quelle} wert={start.quelle} pflicht optionen={SICHERHEIT_QUELLEN.map((q) => ({ wert: q, text: ts.quellen[q] }))} />
        <Feld name="stand" label={tf.stand} typ="date" wert={d(start.stand)} />
        <Auswahl name="dokumentId" label={tf.dokument} wert={start.dokumentId} leerText={ts.keineAuswahl} optionen={dokumente.map((x) => ({ wert: x.id, text: x.titel }))} />
      </Felder>
      <Haken name="hausIds" titel={tf.haeuser} optionen={haeuser.map((h) => ({ wert: h.id, text: h.bezeichnung }))} gewaehlt={start.hausIds} />
      <Haken name="kreditIds" titel={tf.kredite} optionen={kredite.map((k) => ({ wert: k.id, text: `${k.bezeichnung}${k.bank ? ` (${k.bank})` : ""}` }))} gewaehlt={start.kreditIds} />
      <Textfeld name="notiz" label={tf.notiz} wert={start.notiz} />
    </Formular>
  );
}
