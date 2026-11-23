import { notFound } from "next/navigation";
import { Formular } from "@/components/formular";
import { Karte, Seitenkopf } from "@/components/ui";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { formatierer } from "@/lib/format";
import { mietverhaeltnisLoeschen } from "../../../aktionen";
import { formularListen } from "../../../daten";
import { MietverhaeltnisFormular } from "../../../mietverhaeltnis-formular";

export default async function MietverhaeltnisBearbeitenSeite({ params }: PageProps<"/mieter/vertraege/[id]/bearbeiten">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("mieter", "schreiben");
  const t = texte(kontext.mandant.sprache);
  const mv = await kontext.db.mietverhaeltnis.findUnique({ where: { id }, include: { mieter: { select: { name: true } } } });
  if (!mv) notFound();
  const listen = await formularListen(kontext);
  return (
    <div className="max-w-4xl space-y-6">
      <Seitenkopf titel={`${t.mieter.mietverhaeltnis}: ${mv.mieter.name}`} zurueck={{ href: `/mieter/vertraege/${id}`, text: t.mieter.mietverhaeltnis }} />
      <Karte>
        <MietverhaeltnisFormular t={t} f={formatierer(kontext.mandant)} mv={mv} {...listen} />
      </Karte>
      <Formular aktion={mietverhaeltnisLoeschen.bind(null, id)} absenden={t.allgemein.loeschen} art="gefahr" bestaetigen={t.allgemein.loeschenBestaetigen} />
    </div>
  );
}
