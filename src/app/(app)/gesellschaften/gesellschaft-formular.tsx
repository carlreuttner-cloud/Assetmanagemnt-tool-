import { Formular } from "@/components/formular";
import { Feld, Felder, Textfeld } from "@/components/ui";
import type { Texte } from "@/i18n";
import { gesellschaftSpeichern } from "./aktionen";

type Gesellschaft = { id: string; name: string; rechtsform: string | null; registernummer: string | null; steuernummer: string | null; notiz: string | null };

export function GesellschaftFormular({ t, g }: { t: Texte; g?: Gesellschaft }) {
  const tg = t.gesellschaften;
  return (
    <Formular aktion={gesellschaftSpeichern.bind(null, g?.id ?? null)} absenden={t.allgemein.speichern}>
      <Felder>
        <Feld name="name" label={tg.name} wert={g?.name} pflicht breit />
        <Feld name="rechtsform" label={tg.rechtsform} wert={g?.rechtsform} />
        <Feld name="registernummer" label={tg.registernummer} wert={g?.registernummer} />
        <Feld name="steuernummer" label={tg.steuernummer} wert={g?.steuernummer} />
        <Textfeld name="notiz" label={t.allgemein.notiz} wert={g?.notiz} />
      </Felder>
    </Formular>
  );
}
