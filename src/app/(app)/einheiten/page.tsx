import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { EinheitenListe } from "./einheiten-liste";

export default async function EinheitenSeite({ searchParams }: PageProps<"/einheiten">) {
  const sp = await searchParams;
  const kontext = await pruefeZugriff("haeuser");
  const t = texte(kontext.mandant.sprache);
  return <EinheitenListe kontext={kontext} sp={sp} pfad="/einheiten" titel={t.navigation.einheiten} beschreibung={t.seiten.einheiten} />;
}
