import { PlatzhalterSeite } from "@/components/platzhalter-seite";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";

export default async function SzenarienSeite() {
  const kontext = await pruefeZugriff("szenarien");
  const t = texte(kontext.mandant.sprache);
  return <PlatzhalterSeite titel={t.navigation.szenarien} beschreibung={t.seiten.szenarien} />;
}
