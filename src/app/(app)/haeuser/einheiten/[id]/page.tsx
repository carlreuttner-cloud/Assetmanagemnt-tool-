import { notFound } from "next/navigation";
import { Formular } from "@/components/formular";
import { Karte, Seitenkopf } from "@/components/ui";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { formatierer } from "@/lib/format";
import { einheitLoeschen } from "../../aktionen";
import { EinheitFormular } from "../../einheit-formular";

export default async function EinheitBearbeitenSeite({ params }: PageProps<"/haeuser/einheiten/[id]">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("haeuser", "schreiben");
  const t = texte(kontext.mandant.sprache);
  const einheit = await kontext.db.einheit.findUnique({ where: { id }, include: { haus: { select: { id: true, bezeichnung: true } } } });
  if (!einheit) notFound();
  return (
    <div className="max-w-3xl space-y-6">
      <Seitenkopf
        titel={`${t.einheiten.bearbeiten}: ${einheit.bezeichnung}`}
        zurueck={{ href: `/haeuser/${einheit.haus.id}`, text: einheit.haus.bezeichnung }}
      />
      <Karte>
        <EinheitFormular t={t} f={formatierer(kontext.mandant)} hausId={einheit.haus.id} einheit={einheit} />
      </Karte>
      <Formular
        aktion={einheitLoeschen.bind(null, id, einheit.haus.id)}
        absenden={t.allgemein.loeschen}
        art="gefahr"
        bestaetigen={t.allgemein.loeschenBestaetigen}
      />
    </div>
  );
}
