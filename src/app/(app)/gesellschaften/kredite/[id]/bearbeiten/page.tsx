import { notFound } from "next/navigation";
import { Formular } from "@/components/formular";
import { Karte, Seitenkopf } from "@/components/ui";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { formatierer } from "@/lib/format";
import { kreditLoeschen } from "../../../aktionen";
import { KreditFormular } from "../../../kredit-formular";

export default async function KreditBearbeitenSeite({ params }: PageProps<"/gesellschaften/kredite/[id]/bearbeiten">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("gesellschaften", "schreiben");
  const t = texte(kontext.mandant.sprache);
  const kredit = await kontext.db.kredit.findUnique({ where: { id }, include: { haeuser: true } });
  if (!kredit) notFound();
  const [gesellschaften, haeuser, gesellschafter] = await Promise.all([
    kontext.db.gesellschaft.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    kontext.db.haus.findMany({
      where: { OR: [{ gesellschaftId: kredit.gesellschaftId }, { id: { in: kredit.haeuser.map((h) => h.hausId) } }] },
      orderBy: { bezeichnung: "asc" },
      select: { id: true, bezeichnung: true },
    }),
    kontext.db.gesellschafter.findMany({ where: { gesellschaftId: kredit.gesellschaftId }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <div className="max-w-4xl space-y-6">
      <Seitenkopf titel={t.kredite.bearbeiten} zurueck={{ href: `/gesellschaften/kredite/${id}`, text: kredit.bezeichnung }} />
      <Karte>
        <KreditFormular
          t={t}
          f={formatierer(kontext.mandant)}
          kredit={kredit}
          gesellschaftId={kredit.gesellschaftId}
          gesellschaften={gesellschaften}
          haeuser={haeuser}
          gesellschafter={gesellschafter}
        />
      </Karte>
      <Formular aktion={kreditLoeschen.bind(null, id)} absenden={t.allgemein.loeschen} art="gefahr" bestaetigen={t.allgemein.loeschenBestaetigen} />
    </div>
  );
}
