import { PlatzhalterSeite } from "@/components/platzhalter-seite";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";

export default async function UebersichtSeite() {
  const kontext = await pruefeZugriff("uebersicht");
  const t = texte(kontext.mandant.sprache);
  return <PlatzhalterSeite titel={t.navigation.uebersicht} beschreibung={t.seiten.uebersicht} />;
}
