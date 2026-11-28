import { notFound } from "next/navigation";
import { Formular } from "@/components/formular";
import { Karte, Seitenkopf } from "@/components/ui";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { sicherheitFilter } from "@/lib/daten/sicherheiten";
import { formatierer } from "@/lib/format";
import { sicherheitLoeschen } from "../aktionen";
import { formularOptionen } from "../optionen";
import { SicherheitFormular } from "../sicherheit-formular";

export default async function SicherheitSeite({ params }: PageProps<"/sicherheiten/[id]">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("gesellschaften", "schreiben");
  const sicht = await sichtbarkeit(kontext);
  const t = texte(kontext.mandant.sprache);
  const s = await kontext.db.sicherheit.findFirst({ where: { id, ...sicherheitFilter(sicht) }, include: { haeuser: { select: { hausId: true } }, kredite: { select: { kreditId: true } } } });
  if (!s) notFound();
  const opt = await formularOptionen(kontext, sicht);
  return (
    <div className="max-w-4xl space-y-6">
      <Seitenkopf titel={`${t.sicherheiten.arten[s.art]} · ${s.glaeubiger}`} zurueck={{ href: "/sicherheiten", text: t.sicherheiten.zurueck }} />
      <Karte titel={t.sicherheiten.bearbeiten}>
        <SicherheitFormular start={{ ...s, hausIds: s.haeuser.map((h) => h.hausId), kreditIds: s.kredite.map((k) => k.kreditId) }} t={t} f={formatierer(kontext.mandant)} {...opt} />
        <div className="mt-4 border-t border-slate-100 pt-4">
          <Formular aktion={sicherheitLoeschen.bind(null, s.id)} absenden={t.sicherheiten.loeschen} art="gefahr" bestaetigen={t.sicherheiten.loeschenBestaetigen} />
        </div>
      </Karte>
    </div>
  );
}
