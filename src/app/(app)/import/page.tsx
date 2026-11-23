import { PlatzhalterSeite } from "@/components/platzhalter-seite";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";

export default async function ImportSeite() {
  const kontext = await pruefeZugriff("import");
  const t = texte(kontext.mandant.sprache);
  return <PlatzhalterSeite titel={t.navigation.import} beschreibung={t.seiten.import} />;
}
