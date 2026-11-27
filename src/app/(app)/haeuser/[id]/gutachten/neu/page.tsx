import { notFound } from "next/navigation";
import { Karte, Seitenkopf } from "@/components/ui";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { erlaubt } from "@/lib/daten/portfolio";
import { formatierer } from "@/lib/format";
import { GutachtenFormular } from "../gutachten-formular";

export default async function GutachtenNeuSeite({ params }: PageProps<"/haeuser/[id]/gutachten/neu">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("haeuser", "schreiben");
  const t = texte(kontext.mandant.sprache);
  const sicht = await sichtbarkeit(kontext);
  const haus = await kontext.db.haus.findFirst({ where: { id: erlaubt(sicht.hausIds, id) }, select: { bezeichnung: true } });
  if (!haus) notFound();
  return (
    <div className="max-w-3xl space-y-6">
      <Seitenkopf titel={t.gutachten.neu} beschreibung={haus.bezeichnung} zurueck={{ href: `/haeuser/${id}/gutachten`, text: t.gutachten.historie }} />
      <Karte>
        <GutachtenFormular t={t} f={formatierer(kontext.mandant)} hausId={id} />
      </Karte>
    </div>
  );
}
