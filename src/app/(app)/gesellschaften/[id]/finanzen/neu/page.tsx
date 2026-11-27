import { notFound } from "next/navigation";
import { Karte, Seitenkopf } from "@/components/ui";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { erlaubt } from "@/lib/daten/portfolio";
import { formatierer } from "@/lib/format";
import { FinanzFormular } from "../finanz-formular";

export default async function GeschaeftsjahrNeuSeite({ params }: PageProps<"/gesellschaften/[id]/finanzen/neu">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("gesellschaften", "schreiben");
  const t = texte(kontext.mandant.sprache);
  const sicht = await sichtbarkeit(kontext);
  const g = await kontext.db.gesellschaft.findFirst({ where: { id: erlaubt(sicht.gesellschaftIds, id) }, select: { name: true } });
  if (!g) notFound();
  const letztes = await kontext.db.geschaeftsjahr.findFirst({ where: { gesellschaftId: id }, orderBy: { jahr: "desc" }, select: { jahr: true } });
  return (
    <div className="max-w-3xl space-y-6">
      <Seitenkopf titel={t.finanzen.neu} beschreibung={g.name} zurueck={{ href: `/gesellschaften/${id}/finanzen`, text: t.finanzen.titel }} />
      <Karte>
        <FinanzFormular t={t} f={formatierer(kontext.mandant)} gesellschaftId={id} vorschlagJahr={letztes ? letztes.jahr + 1 : undefined} />
      </Karte>
    </div>
  );
}
