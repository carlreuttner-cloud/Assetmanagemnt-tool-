import { PlatzhalterSeite } from "@/components/platzhalter-seite";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";

export default async function BerichteSeite() {
  const kontext = await pruefeZugriff("berichte");
  const t = texte(kontext.mandant.sprache);
  return <PlatzhalterSeite titel={t.navigation.berichte} beschreibung={t.seiten.berichte} />;
}
