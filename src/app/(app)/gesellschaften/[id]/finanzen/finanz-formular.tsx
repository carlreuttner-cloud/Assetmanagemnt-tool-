import { Formular } from "@/components/formular";
import { Auswahl, Feld, Felder, Textfeld } from "@/components/ui";
import type { Texte } from "@/i18n";
import type { GeschaeftsjahrZeile } from "@/lib/daten/finanzen";
import { BILANZ_POSTEN, CASHFLOW_POSTEN, GUV_POSTEN, type Posten } from "@/lib/finanzen";
import type { Formatierer } from "@/lib/format";
import { geschaeftsjahrSpeichern } from "../../aktionen";

export function FinanzFormular({ t, f, gesellschaftId, j, vorschlagJahr }: { t: Texte; f: Formatierer; gesellschaftId: string; j?: GeschaeftsjahrZeile; vorschlagJahr?: number }) {
  const tf = t.finanzen;
  const jahr = j?.jahr ?? vorschlagJahr;
  const gruppe = (titel: string, posten: readonly Posten[]) => (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-slate-800">{titel}</legend>
      <Felder>
        {posten.map((p) => (
          <Feld key={p} name={p} label={tf.posten[p]} wert={f.eingabe(j?.[p], 2)} inputMode="decimal" />
        ))}
      </Felder>
    </fieldset>
  );
  return (
    <Formular aktion={geschaeftsjahrSpeichern.bind(null, { id: j?.id ?? null, gesellschaftId })} absenden={t.allgemein.speichern} className="space-y-6">
      <p className="text-xs text-slate-500">{tf.formular.hinweis}</p>
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-slate-800">{tf.formular.allgemein}</legend>
        <Felder>
          <Feld name="jahr" label={tf.jahr} wert={jahr ? String(jahr) : undefined} inputMode="numeric" pflicht />
          <Auswahl
            name="status"
            label={tf.status}
            wert={j?.status ?? "ENDGUELTIG"}
            optionen={(["ENDGUELTIG", "ENTWURF"] as const).map((s) => ({ wert: s, text: t.abschlussStatus[s] }))}
            pflicht
          />
          <Feld name="beginn" label={tf.beginn} typ="date" wert={j?.beginn ?? (jahr ? `${jahr}-01-01` : undefined)} pflicht />
          <Feld name="ende" label={tf.ende} typ="date" wert={j?.ende ?? (jahr ? `${jahr}-12-31` : undefined)} pflicht />
          <Auswahl
            name="quelle"
            label={tf.quelle}
            wert={j?.quelle ?? "JAHRESABSCHLUSS"}
            optionen={(["JAHRESABSCHLUSS", "BWA", "SONSTIGE"] as const).map((q) => ({ wert: q, text: t.abschlussQuellen[q] }))}
            pflicht
          />
          <Feld name="quelleText" label={tf.quelleText} wert={j?.quelleText} />
        </Felder>
      </fieldset>
      {gruppe(tf.guv, GUV_POSTEN)}
      {gruppe(tf.bilanz, BILANZ_POSTEN)}
      {gruppe(tf.cashflow, CASHFLOW_POSTEN)}
      <Felder>
        <Textfeld name="notiz" label={t.allgemein.notiz} wert={j?.notiz} />
      </Felder>
    </Formular>
  );
}
