import { Formular } from "@/components/formular";
import { Auswahl, Feld, Felder, Textfeld } from "@/components/ui";
import type { Texte } from "@/i18n";
import { gesellschaftSpeichern } from "./aktionen";

type Gesellschaft = { id: string; name: string; rechtsform: string | null; registernummer: string | null; steuernummer: string | null; notiz: string | null; portfolioId: string | null };

export function GesellschaftFormular({ t, g, portfolios, portfolioId }: { t: Texte; g?: Gesellschaft; portfolios: Array<{ id: string; name: string }>; portfolioId?: string }) {
  const tg = t.gesellschaften;
  return (
    <Formular aktion={gesellschaftSpeichern.bind(null, g?.id ?? null)} absenden={t.allgemein.speichern}>
      <Felder>
        <Feld name="name" label={tg.name} wert={g?.name} pflicht breit />
        <Auswahl
          name="portfolioId"
          label={tg.portfolio}
          optionen={portfolios.map((p) => ({ wert: p.id, text: p.name }))}
          wert={g ? g.portfolioId : portfolioId}
          leerText={tg.keinPortfolio}
          hinweis={tg.portfolioHinweis}
        />
        <Feld name="rechtsform" label={tg.rechtsform} wert={g?.rechtsform} />
        <Feld name="registernummer" label={tg.registernummer} wert={g?.registernummer} />
        <Feld name="steuernummer" label={tg.steuernummer} wert={g?.steuernummer} />
        <Textfeld name="notiz" label={t.allgemein.notiz} wert={g?.notiz} />
      </Felder>
    </Formular>
  );
}
