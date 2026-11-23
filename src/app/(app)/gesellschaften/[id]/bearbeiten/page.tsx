import { notFound } from "next/navigation";
import { Formular } from "@/components/formular";
import { Karte, Seitenkopf } from "@/components/ui";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { gesellschaftLoeschen } from "../../aktionen";
import { GesellschaftFormular } from "../../gesellschaft-formular";

export default async function GesellschaftBearbeitenSeite({ params }: PageProps<"/gesellschaften/[id]/bearbeiten">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("gesellschaften", "schreiben");
  const t = texte(kontext.mandant.sprache);
  const g = await kontext.db.gesellschaft.findUnique({ where: { id } });
  if (!g) notFound();
  return (
    <div className="max-w-3xl space-y-6">
      <Seitenkopf titel={t.gesellschaften.bearbeiten} zurueck={{ href: `/gesellschaften/${id}`, text: g.name }} />
      <Karte>
        <GesellschaftFormular t={t} g={g} />
      </Karte>
      <Formular aktion={gesellschaftLoeschen.bind(null, id)} absenden={t.allgemein.loeschen} art="gefahr" bestaetigen={t.allgemein.loeschenBestaetigen} />
    </div>
  );
}
