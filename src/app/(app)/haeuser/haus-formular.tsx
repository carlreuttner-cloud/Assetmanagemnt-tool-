import { Formular } from "@/components/formular";
import { Auswahl, Feld, Felder, Textfeld } from "@/components/ui";
import type { Texte } from "@/i18n";
import { isoDatum } from "@/lib/datum";
import type { Formatierer } from "@/lib/format";
import { hausSpeichern } from "./aktionen";

type Haus = {
  id: string;
  gesellschaftId: string;
  bezeichnung: string;
  strasse: string | null;
  plz: string | null;
  ort: string | null;
  kaufpreis: { toFixed(): string } | null;
  kaufdatum: Date | null;
  notiz: string | null;
};

export function HausFormular({
  t,
  f,
  haus,
  gesellschaftId,
  gesellschaften,
}: {
  t: Texte;
  f: Formatierer;
  haus?: Haus;
  gesellschaftId?: string;
  gesellschaften: { id: string; name: string }[];
}) {
  const h = t.haeuser;
  return (
    <Formular aktion={hausSpeichern.bind(null, haus?.id ?? null)} absenden={t.allgemein.speichern}>
      <Felder>
        <Feld name="bezeichnung" label={h.bezeichnung} wert={haus?.bezeichnung} pflicht />
        <Auswahl
          name="gesellschaftId"
          label={h.gesellschaft}
          wert={haus?.gesellschaftId ?? gesellschaftId}
          optionen={gesellschaften.map((g) => ({ wert: g.id, text: g.name }))}
          pflicht
        />
        <Feld name="strasse" label={h.strasse} wert={haus?.strasse} breit />
        <Feld name="plz" label={h.plz} wert={haus?.plz} />
        <Feld name="ort" label={h.ort} wert={haus?.ort} />
        <Feld name="kaufpreis" label={h.kaufpreis} wert={f.eingabe(haus?.kaufpreis, 2)} inputMode="decimal" />
        <Feld name="kaufdatum" label={h.kaufdatum} typ="date" wert={isoDatum(haus?.kaufdatum)} />
        <Textfeld name="notiz" label={t.allgemein.notiz} wert={haus?.notiz} />
      </Felder>
    </Formular>
  );
}
