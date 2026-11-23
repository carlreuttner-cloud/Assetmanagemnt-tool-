import { Karte, Seitenkopf } from "@/components/ui";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { formatierer } from "@/lib/format";
import { HausFormular } from "../haus-formular";

export default async function NeuesHausSeite({ searchParams }: PageProps<"/haeuser/neu">) {
  const { gesellschaft } = await searchParams;
  const kontext = await pruefeZugriff("haeuser", "schreiben");
  const t = texte(kontext.mandant.sprache);
  const gesellschaften = await kontext.db.gesellschaft.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  return (
    <div className="max-w-3xl">
      <Seitenkopf titel={t.haeuser.neu} zurueck={{ href: "/haeuser", text: t.haeuser.titel }} />
      <Karte>
        <HausFormular t={t} f={formatierer(kontext.mandant)} gesellschaften={gesellschaften} gesellschaftId={typeof gesellschaft === "string" ? gesellschaft : undefined} />
      </Karte>
    </div>
  );
}
