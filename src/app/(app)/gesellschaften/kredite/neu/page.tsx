import { notFound } from "next/navigation";
import { Karte, Seitenkopf } from "@/components/ui";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { formatierer } from "@/lib/format";
import { KreditFormular } from "../../kredit-formular";

export default async function NeuerKreditSeite({ searchParams }: PageProps<"/gesellschaften/kredite/neu">) {
  const { gesellschaft } = await searchParams;
  const kontext = await pruefeZugriff("gesellschaften", "schreiben");
  const t = texte(kontext.mandant.sprache);
  const gesellschaften = await kontext.db.gesellschaft.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  const gewaehlt = gesellschaften.find((g) => g.id === gesellschaft) ?? gesellschaften[0];
  if (!gewaehlt) notFound();
  const haeuser = await kontext.db.haus.findMany({
    where: { gesellschaftId: gewaehlt.id },
    orderBy: { bezeichnung: "asc" },
    select: { id: true, bezeichnung: true },
  });
  const gesellschafter = await kontext.db.gesellschafter.findMany({ where: { gesellschaftId: gewaehlt.id }, orderBy: { name: "asc" }, select: { id: true, name: true } });
  return (
    <div className="max-w-4xl">
      <Seitenkopf titel={t.kredite.neu} zurueck={{ href: `/gesellschaften/${gewaehlt.id}`, text: gewaehlt.name }} />
      <Karte>
        <KreditFormular t={t} f={formatierer(kontext.mandant)} gesellschaftId={gewaehlt.id} gesellschaften={gesellschaften} haeuser={haeuser} gesellschafter={gesellschafter} />
      </Karte>
    </div>
  );
}
