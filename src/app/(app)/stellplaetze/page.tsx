import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { EinheitenListe } from "../einheiten/einheiten-liste";

/** Reiter Stellplätze: alle Stellplätze und Garagen, gezählt in Stück. */
export default async function StellplaetzeSeite({ searchParams }: PageProps<"/stellplaetze">) {
  const sp = await searchParams;
  const kontext = await pruefeZugriff("haeuser");
  const t = texte(kontext.mandant.sprache);
  return (
    <EinheitenListe kontext={kontext} sp={sp} pfad="/stellplaetze" festeArt="STELLPLATZ" titel={t.navigation.stellplaetze} beschreibung={t.nutzung.beschreibungStellplaetze} />
  );
}
