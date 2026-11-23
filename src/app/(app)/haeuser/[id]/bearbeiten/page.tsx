import { notFound } from "next/navigation";
import { Formular } from "@/components/formular";
import { Karte, Seitenkopf } from "@/components/ui";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { formatierer } from "@/lib/format";
import { hausLoeschen } from "../../aktionen";
import { HausFormular } from "../../haus-formular";

export default async function HausBearbeitenSeite({ params }: PageProps<"/haeuser/[id]/bearbeiten">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("haeuser", "schreiben");
  const t = texte(kontext.mandant.sprache);
  const [haus, gesellschaften] = await Promise.all([
    kontext.db.haus.findUnique({ where: { id } }),
    kontext.db.gesellschaft.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!haus) notFound();
  return (
    <div className="max-w-3xl space-y-6">
      <Seitenkopf titel={t.haeuser.bearbeiten} zurueck={{ href: `/haeuser/${id}`, text: haus.bezeichnung }} />
      <Karte>
        <HausFormular t={t} f={formatierer(kontext.mandant)} haus={haus} gesellschaften={gesellschaften} />
      </Karte>
      <Formular aktion={hausLoeschen.bind(null, id)} absenden={t.allgemein.loeschen} art="gefahr" bestaetigen={t.allgemein.loeschenBestaetigen} />
    </div>
  );
}
