import { notFound } from "next/navigation";
import { Karte, Seitenkopf } from "@/components/ui";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { formatierer } from "@/lib/format";
import { EinheitFormular } from "../../../einheit-formular";

export default async function NeueEinheitSeite({ params }: PageProps<"/haeuser/[id]/einheiten/neu">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("haeuser", "schreiben");
  const t = texte(kontext.mandant.sprache);
  const haus = await kontext.db.haus.findUnique({ where: { id }, select: { bezeichnung: true } });
  if (!haus) notFound();
  return (
    <div className="max-w-3xl">
      <Seitenkopf titel={t.einheiten.neu} zurueck={{ href: `/haeuser/${id}`, text: haus.bezeichnung }} />
      <Karte>
        <EinheitFormular t={t} f={formatierer(kontext.mandant)} hausId={id} />
      </Karte>
    </div>
  );
}
