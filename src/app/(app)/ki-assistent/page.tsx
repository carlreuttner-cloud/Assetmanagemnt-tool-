import { PlatzhalterSeite } from "@/components/platzhalter-seite";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";

export default async function KiAssistentSeite() {
  const kontext = await pruefeZugriff("kiAssistent");
  const t = texte(kontext.mandant.sprache);
  return <PlatzhalterSeite titel={t.navigation.kiAssistent} beschreibung={t.seiten.kiAssistent} />;
}
