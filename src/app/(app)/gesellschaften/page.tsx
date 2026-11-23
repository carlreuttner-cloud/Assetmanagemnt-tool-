import { PlatzhalterSeite } from "@/components/platzhalter-seite";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";

export default async function GesellschaftenSeite() {
  const kontext = await pruefeZugriff("gesellschaften");
  const t = texte(kontext.mandant.sprache);
  return <PlatzhalterSeite titel={t.navigation.gesellschaften} beschreibung={t.seiten.gesellschaften} />;
}
