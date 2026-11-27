import { Formular } from "@/components/formular";
import { Auswahl, Feld, Felder, Textfeld } from "@/components/ui";
import type { Texte } from "@/i18n";
import { isoDatum } from "@/lib/datum";
import type { Formatierer } from "@/lib/format";
import { gutachtenSpeichern } from "../../aktionen";

type Zahl = { toFixed(): string } | null;

export type GutachtenZeile = {
  id: string;
  stichtag: Date;
  erstelltAm: Date | null;
  gutachter: string | null;
  anlass: string | null;
  verfahren: "ERTRAGSWERT" | "SACHWERT" | "VERGLEICHSWERT" | "SONSTIGES" | null;
  verkehrswert: { toFixed(): string };
  rohertragJahr: Zahl;
  bewirtschaftungskosten: Zahl;
  reinertragJahr: Zahl;
  liegenschaftszins: Zahl;
  restnutzungsdauer: number | null;
  gesamtnutzungsdauer: number | null;
  barwertfaktor: Zahl;
  bodenwert: Zahl;
  gebaeudewert: Zahl;
  ertragswert: Zahl;
  sachwert: Zahl;
  vergleichswert: Zahl;
  zuAbschlaege: Zahl;
  baujahr: number | null;
  wohnflaeche: Zahl;
  gewerbeflaeche: Zahl;
  grundstuecksflaeche: Zahl;
  einheiten: number | null;
  zustand: string | null;
  energieklasse: string | null;
  lage: string | null;
  staerken: string | null;
  schwaechen: string | null;
  chancen: string | null;
  risiken: string | null;
  notiz: string | null;
};

function Abschnitt({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-slate-800">{titel}</legend>
      <Felder>{children}</Felder>
    </fieldset>
  );
}

export function GutachtenFormular({ t, f, hausId, g }: { t: Texte; f: Formatierer; hausId: string; g?: GutachtenZeile }) {
  const tg = t.gutachten;
  const n = (w: number | null | undefined) => (w == null ? undefined : String(w));
  return (
    <Formular aktion={gutachtenSpeichern.bind(null, { id: g?.id ?? null, hausId })} absenden={t.allgemein.speichern} className="space-y-6">
      <Abschnitt titel={tg.formular.allgemein}>
        <Feld name="stichtag" label={tg.stichtag} typ="date" wert={isoDatum(g?.stichtag)} pflicht />
        <Feld name="erstelltAm" label={tg.erstelltAm} typ="date" wert={isoDatum(g?.erstelltAm)} />
        <Feld name="verkehrswert" label={tg.verkehrswert} wert={f.eingabe(g?.verkehrswert, 2)} inputMode="decimal" pflicht hinweis={tg.verkehrswertVerknuepft} />
        <Auswahl
          name="verfahren"
          label={tg.verfahren}
          wert={g?.verfahren}
          leerText="–"
          optionen={(Object.keys(tg.verfahrenArten) as Array<keyof typeof tg.verfahrenArten>).map((k) => ({ wert: k, text: tg.verfahrenArten[k] }))}
        />
        <Feld name="gutachter" label={tg.gutachter} wert={g?.gutachter} />
        <Feld name="anlass" label={tg.anlass} wert={g?.anlass} />
      </Abschnitt>

      <Abschnitt titel={tg.formular.faktoren}>
        <Feld name="rohertragJahr" label={tg.rohertragJahr} wert={f.eingabe(g?.rohertragJahr, 2)} inputMode="decimal" />
        <Feld name="bewirtschaftungskosten" label={tg.bewirtschaftungskosten} wert={f.eingabe(g?.bewirtschaftungskosten, 2)} inputMode="decimal" />
        <Feld name="reinertragJahr" label={tg.reinertragJahr} wert={f.eingabe(g?.reinertragJahr, 2)} inputMode="decimal" />
        <Feld name="liegenschaftszins" label={tg.liegenschaftszins} wert={f.eingabe(g?.liegenschaftszins)} inputMode="decimal" hinweis={tg.formular.prozentHinweis} />
        <Feld name="restnutzungsdauer" label={tg.restnutzungsdauer} wert={n(g?.restnutzungsdauer)} inputMode="numeric" hinweis={tg.formular.jahreHinweis} />
        <Feld name="gesamtnutzungsdauer" label={tg.gesamtnutzungsdauer} wert={n(g?.gesamtnutzungsdauer)} inputMode="numeric" hinweis={tg.formular.jahreHinweis} />
        <Feld name="barwertfaktor" label={tg.barwertfaktor} wert={f.eingabe(g?.barwertfaktor)} inputMode="decimal" />
        <Feld name="bodenwert" label={tg.bodenwert} wert={f.eingabe(g?.bodenwert, 2)} inputMode="decimal" />
        <Feld name="gebaeudewert" label={tg.gebaeudewert} hinweis={tg.gebaeudewertHinweis} wert={f.eingabe(g?.gebaeudewert, 2)} inputMode="decimal" />
        <Feld name="ertragswert" label={tg.ertragswert} wert={f.eingabe(g?.ertragswert, 2)} inputMode="decimal" />
        <Feld name="sachwert" label={tg.sachwert} wert={f.eingabe(g?.sachwert, 2)} inputMode="decimal" />
        <Feld name="vergleichswert" label={tg.vergleichswert} wert={f.eingabe(g?.vergleichswert, 2)} inputMode="decimal" />
        <Feld name="zuAbschlaege" label={tg.zuAbschlaege} wert={f.eingabe(g?.zuAbschlaege, 2)} inputMode="decimal" hinweis={tg.zuAbschlaegeHinweis} />
      </Abschnitt>

      <Abschnitt titel={tg.formular.objekt}>
        <Feld name="baujahr" label={tg.baujahr} wert={n(g?.baujahr)} inputMode="numeric" />
        <Feld name="einheiten" label={tg.einheiten} wert={n(g?.einheiten)} inputMode="numeric" />
        <Feld name="wohnflaeche" label={`${tg.wohnflaeche} (m²)`} wert={f.eingabe(g?.wohnflaeche)} inputMode="decimal" />
        <Feld name="gewerbeflaeche" label={`${tg.gewerbeflaeche} (m²)`} wert={f.eingabe(g?.gewerbeflaeche)} inputMode="decimal" />
        <Feld name="grundstuecksflaeche" label={`${tg.grundstuecksflaeche} (m²)`} wert={f.eingabe(g?.grundstuecksflaeche)} inputMode="decimal" />
        <Feld name="energieklasse" label={tg.energieklasse} wert={g?.energieklasse} />
        <Feld name="zustand" label={tg.zustand} wert={g?.zustand} />
        <Feld name="lage" label={tg.lage} wert={g?.lage} />
      </Abschnitt>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-slate-800">{tg.formular.swot}</legend>
        <p className="text-xs text-slate-500">{tg.swotHinweis}</p>
        <Felder>
          <Textfeld name="staerken" label={tg.staerken} wert={g?.staerken} />
          <Textfeld name="schwaechen" label={tg.schwaechen} wert={g?.schwaechen} />
          <Textfeld name="chancen" label={tg.chancen} wert={g?.chancen} />
          <Textfeld name="risiken" label={tg.risiken} wert={g?.risiken} />
          <Textfeld name="notiz" label={t.allgemein.notiz} wert={g?.notiz} />
        </Felder>
      </fieldset>
    </Formular>
  );
}
