import { Formular } from "@/components/formular";
import { Auswahl, Feld, Felder, Textfeld } from "@/components/ui";
import type { Texte } from "@/i18n";
import type { Formatierer } from "@/lib/format";
import { einheitSpeichern } from "./aktionen";
import type { Nutzungsart } from "@/lib/nutzungsart";

type Einheit = {
  id: string;
  bezeichnung: string;
  art: Nutzungsart;
  flaeche: { toFixed(): string };
  lage: string | null;
  erwarteteMiete: { toFixed(): string } | null;
  notiz: string | null;
};

export function EinheitFormular({ t, f, hausId, einheit }: { t: Texte; f: Formatierer; hausId: string; einheit?: Einheit }) {
  const e = t.einheiten;
  return (
    <Formular aktion={einheitSpeichern.bind(null, { id: einheit?.id ?? null, hausId })} absenden={t.allgemein.speichern}>
      <Felder>
        <Feld name="bezeichnung" label={e.bezeichnung} wert={einheit?.bezeichnung} platzhalter="WE 01" pflicht />
        <Auswahl
          name="art"
          label={e.art}
          wert={einheit?.art ?? "WOHNUNG"}
          optionen={Object.entries(t.einheitArten).map(([wert, text]) => ({ wert, text }))}
          pflicht
        />
        <Feld name="flaeche" label={e.flaeche} wert={f.eingabe(einheit?.flaeche)} inputMode="decimal" hinweis={e.flaecheHinweisStellplatz} pflicht />
        <Feld name="lage" label={e.lage} wert={einheit?.lage} platzhalter="2. OG links" />
        <Feld
          name="erwarteteMiete"
          label={e.erwarteteMiete}
          wert={f.eingabe(einheit?.erwarteteMiete, 2)}
          inputMode="decimal"
          hinweis={e.erwarteteMieteHinweis}
          breit
        />
        <Textfeld name="notiz" label={t.allgemein.notiz} wert={einheit?.notiz} />
      </Felder>
    </Formular>
  );
}
