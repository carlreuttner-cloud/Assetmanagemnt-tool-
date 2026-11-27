import { Formular } from "@/components/formular";
import { Ankreuzfeld, Auswahl, Feld, Felder, Textfeld } from "@/components/ui";
import type { Texte } from "@/i18n";
import { isoDatum } from "@/lib/datum";
import type { Formatierer } from "@/lib/format";
import { massnahmeSpeichern } from "./aktionen";

type Vorhanden = {
  id: string;
  bezeichnung: string;
  kategorie: string | null;
  status: "GEPLANT" | "LAUFEND" | "ABGESCHLOSSEN";
  einheitId: string | null;
  budget: { toFixed(): string } | null;
  budgetQuelle: string | null;
  beginn: Date | null;
  ende: Date | null;
  mehrmieteMonat: { toFixed(): string } | null;
  mehrmieteBelegt: boolean;
  mehrmieteQuelle: string | null;
  notiz: string | null;
};

export function MassnahmeFormular({
  t,
  f,
  m,
  haeuser,
  hausVorwahl,
  einheiten,
}: {
  t: Texte;
  f: Formatierer;
  m?: Vorhanden;
  haeuser?: Array<{ id: string; bezeichnung: string }>;
  hausVorwahl?: string | null;
  einheiten?: Array<{ id: string; bezeichnung: string }>;
}) {
  const tm = t.massnahmen;
  return (
    <Formular aktion={massnahmeSpeichern.bind(null, m?.id ?? null)} absenden={t.allgemein.speichern}>
      <Felder>
        {haeuser && <Auswahl name="hausId" label={tm.haus} optionen={haeuser.map((h) => ({ wert: h.id, text: h.bezeichnung }))} wert={hausVorwahl} pflicht />}
        {einheiten && <Auswahl name="einheitId" label={tm.einheit} leerText={tm.ganzesHaus} optionen={einheiten.map((e) => ({ wert: e.id, text: e.bezeichnung }))} wert={m?.einheitId} />}
        <Feld name="bezeichnung" label={tm.bezeichnung} wert={m?.bezeichnung} pflicht />
        <Feld name="kategorie" label={tm.kategorie} wert={m?.kategorie} platzhalter="Dach, Heizung, …" />
        <Auswahl name="status" label={tm.status} optionen={(["GEPLANT", "LAUFEND", "ABGESCHLOSSEN"] as const).map((s) => ({ wert: s, text: tm.stati[s] }))} wert={m?.status ?? "GEPLANT"} pflicht />
        <Feld name="budget" label={tm.budget} wert={f.eingabe(m?.budget, 2)} inputMode="decimal" />
        <Feld name="budgetQuelle" label={tm.budgetQuelle} wert={m?.budgetQuelle} hinweis={tm.budgetQuelleHinweis} />
        <Feld name="beginn" label={tm.beginn} typ="date" wert={isoDatum(m?.beginn ?? null)} />
        <Feld name="ende" label={tm.ende} typ="date" wert={isoDatum(m?.ende ?? null)} />
        <Feld name="mehrmieteMonat" label={tm.mehrmieteMonat} wert={f.eingabe(m?.mehrmieteMonat, 2)} inputMode="decimal" hinweis={tm.mehrmieteHinweis} />
        <Feld name="mehrmieteQuelle" label={tm.mehrmieteQuelle} wert={m?.mehrmieteQuelle} />
        <Ankreuzfeld name="mehrmieteBelegt" label={tm.mehrmieteBelegt} wert={m?.mehrmieteBelegt ?? false} />
        <Textfeld name="notiz" label={tm.notiz} wert={m?.notiz} />
      </Felder>
    </Formular>
  );
}
