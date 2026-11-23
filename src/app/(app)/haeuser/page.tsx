import { PlatzhalterSeite } from "@/components/platzhalter-seite";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";

export default async function HaeuserSeite() {
  const kontext = await pruefeZugriff("haeuser");
  const t = texte(kontext.mandant.sprache);
  return <PlatzhalterSeite titel={t.navigation.haeuser} beschreibung={t.seiten.haeuser} />;
}
