import { Karte, Seitenkopf } from "@/components/ui";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { formatierer } from "@/lib/format";
import { formularListen } from "../daten";
import { MietverhaeltnisFormular } from "../mietverhaeltnis-formular";

export default async function NeuesMietverhaeltnisSeite({ searchParams }: PageProps<"/mieter/neu">) {
  const { einheit } = await searchParams;
  const kontext = await pruefeZugriff("mieter", "schreiben");
  const t = texte(kontext.mandant.sprache);
  const listen = await formularListen(kontext);
  return (
    <div className="max-w-4xl">
      <Seitenkopf titel={t.mieter.neuesMietverhaeltnis} zurueck={{ href: "/mieter", text: t.mieter.titel }} />
      <Karte>
        <MietverhaeltnisFormular t={t} f={formatierer(kontext.mandant)} einheitId={typeof einheit === "string" ? einheit : undefined} {...listen} />
      </Karte>
    </div>
  );
}
