import { Formular } from "@/components/formular";
import { Ankreuzfeld, Auswahl, Feld, Felder, Textfeld } from "@/components/ui";
import type { Texte } from "@/i18n";
import { isoDatum } from "@/lib/datum";
import type { Formatierer } from "@/lib/format";
import { mietverhaeltnisSpeichern } from "./aktionen";

type Dez = { toFixed(): string } | null;
type Mietverhaeltnis = {
  id: string;
  einheitId: string;
  mieterId: string;
  beginn: Date;
  ende: Date | null;
  sollMiete: Dez;
  istMiete: Dez;
  letzteMieterhoehung: Date | null;
  rueckstand: Dez;
  rueckstandStichtag: Date | null;
  notiz: string | null;
};

export function MietverhaeltnisFormular({
  t,
  f,
  mv,
  einheitId,
  einheiten,
  mieter,
}: {
  t: Texte;
  f: Formatierer;
  mv?: Mietverhaeltnis;
  einheitId?: string;
  einheiten: { id: string; text: string }[];
  mieter: { id: string; name: string }[];
}) {
  const m = t.mieter;
  return (
    <Formular aktion={mietverhaeltnisSpeichern.bind(null, mv?.id ?? null)} absenden={t.allgemein.speichern} className="space-y-6">
      <Felder>
        <Auswahl name="einheitId" label={m.einheit} wert={mv?.einheitId ?? einheitId} optionen={einheiten.map((e) => ({ wert: e.id, text: e.text }))} pflicht />
        <Auswahl
          name="mieterId"
          label={m.mieterAuswahl}
          wert={mv?.mieterId}
          leerText="–"
          optionen={mieter.map((x) => ({ wert: x.id, text: x.name }))}
        />
        {!mv && (
          <>
            <Feld name="mieterName" label={m.mieterNeu} />
            <div className="flex items-end pb-2">
              <Ankreuzfeld name="istFirma" label={m.istFirma} />
            </div>
          </>
        )}
      </Felder>
      <Felder>
        <Feld name="beginn" label={m.beginn} typ="date" wert={isoDatum(mv?.beginn)} pflicht />
        <Feld name="ende" label={m.ende} typ="date" wert={isoDatum(mv?.ende)} hinweis={m.endeHinweis} />
        <Feld name="sollMiete" label={m.sollMiete} wert={f.eingabe(mv?.sollMiete, 2)} inputMode="decimal" hinweis={m.sollMieteHinweis} pflicht />
        <Feld name="istMiete" label={m.istMiete} wert={f.eingabe(mv?.istMiete, 2)} inputMode="decimal" hinweis={m.istMieteHinweis} />
        <Feld name="letzteMieterhoehung" label={m.letzteMieterhoehung} typ="date" wert={isoDatum(mv?.letzteMieterhoehung)} />
        <div />
        <Feld name="rueckstand" label={m.rueckstand} wert={f.eingabe(mv?.rueckstand, 2)} inputMode="decimal" />
        <Feld name="rueckstandStichtag" label={m.rueckstandStichtag} typ="date" wert={isoDatum(mv?.rueckstandStichtag)} />
        <Textfeld name="notiz" label={t.allgemein.notiz} wert={mv?.notiz} />
      </Felder>
    </Formular>
  );
}
