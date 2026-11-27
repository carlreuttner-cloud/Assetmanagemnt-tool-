import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { EinheitenListe } from "../einheiten/einheiten-liste";

/** Reiter Gewerbe: alle Gewerbeeinheiten (Sichtbarkeit wie Einheiten). */
export default async function GewerbeSeite({ searchParams }: PageProps<"/gewerbe">) {
  const sp = await searchParams;
  const kontext = await pruefeZugriff("haeuser");
  const t = texte(kontext.mandant.sprache);
  return <EinheitenListe kontext={kontext} sp={sp} pfad="/gewerbe" festeArt="GEWERBE" titel={t.navigation.gewerbe} beschreibung={t.nutzung.beschreibungGewerbe} />;
}
