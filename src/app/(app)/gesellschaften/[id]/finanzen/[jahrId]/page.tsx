import { notFound } from "next/navigation";
import { Formular } from "@/components/formular";
import { Karte, Seitenkopf } from "@/components/ui";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { erlaubt } from "@/lib/daten/portfolio";
import { ladeGeschaeftsjahre } from "@/lib/daten/finanzen";
import { formatierer } from "@/lib/format";
import { geschaeftsjahrLoeschen } from "../../../aktionen";
import { FinanzFormular } from "../finanz-formular";

export default async function GeschaeftsjahrBearbeitenSeite({ params }: PageProps<"/gesellschaften/[id]/finanzen/[jahrId]">) {
  const { id, jahrId } = await params;
  const kontext = await pruefeZugriff("gesellschaften", "schreiben");
  const t = texte(kontext.mandant.sprache);
  const sicht = await sichtbarkeit(kontext);
  const g = await kontext.db.gesellschaft.findFirst({ where: { id: erlaubt(sicht.gesellschaftIds, id) }, select: { name: true } });
  if (!g) notFound();
  const j = (await ladeGeschaeftsjahre(kontext, id)).find((x) => x.id === jahrId);
  if (!j) notFound();
  return (
    <div className="max-w-3xl space-y-6">
      <Seitenkopf titel={`${t.finanzen.bearbeiten} ${j.jahr}`} beschreibung={g.name} zurueck={{ href: `/gesellschaften/${id}/finanzen`, text: t.finanzen.titel }} />
      <Karte>
        <FinanzFormular t={t} f={formatierer(kontext.mandant)} gesellschaftId={id} j={j} />
      </Karte>
      <Formular aktion={geschaeftsjahrLoeschen.bind(null, jahrId, id)} absenden={t.allgemein.loeschen} art="gefahr" bestaetigen={t.allgemein.loeschenBestaetigen} />
    </div>
  );
}
