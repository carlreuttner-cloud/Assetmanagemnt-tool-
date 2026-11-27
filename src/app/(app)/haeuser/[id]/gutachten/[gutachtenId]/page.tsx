import { notFound } from "next/navigation";
import { Formular } from "@/components/formular";
import { Karte, Seitenkopf } from "@/components/ui";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { erlaubt } from "@/lib/daten/portfolio";
import { formatierer } from "@/lib/format";
import { gutachtenLoeschen } from "../../../aktionen";
import { GutachtenFormular } from "../gutachten-formular";

export default async function GutachtenBearbeitenSeite({ params }: PageProps<"/haeuser/[id]/gutachten/[gutachtenId]">) {
  const { id, gutachtenId } = await params;
  const kontext = await pruefeZugriff("haeuser", "schreiben");
  const t = texte(kontext.mandant.sprache);
  const f = formatierer(kontext.mandant);
  const sicht = await sichtbarkeit(kontext);
  const g = await kontext.db.gutachten.findFirst({
    where: { id: gutachtenId, hausId: erlaubt(sicht.hausIds, id) },
    include: { haus: { select: { bezeichnung: true } } },
  });
  if (!g) notFound();
  return (
    <div className="max-w-3xl space-y-6">
      <Seitenkopf
        titel={t.gutachten.bearbeiten}
        beschreibung={`${g.haus.bezeichnung} · ${f.datum(g.stichtag)}`}
        zurueck={{ href: `/haeuser/${id}/gutachten`, text: t.gutachten.historie }}
      />
      <Karte>
        <GutachtenFormular t={t} f={f} hausId={id} g={g} />
      </Karte>
      <Formular aktion={gutachtenLoeschen.bind(null, gutachtenId, id)} absenden={t.allgemein.loeschen} art="gefahr" bestaetigen={t.allgemein.loeschenBestaetigen} />
    </div>
  );
}
