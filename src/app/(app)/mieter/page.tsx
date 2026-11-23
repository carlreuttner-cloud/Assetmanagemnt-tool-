import { PlatzhalterSeite } from "@/components/platzhalter-seite";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";

export default async function MieterSeite() {
  const kontext = await pruefeZugriff("mieter");
  const t = texte(kontext.mandant.sprache);
  return <PlatzhalterSeite titel={t.navigation.mieter} beschreibung={t.seiten.mieter} />;
}
