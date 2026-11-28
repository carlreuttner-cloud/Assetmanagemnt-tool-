import { Karte, Seitenkopf } from "@/components/ui";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { formatierer } from "@/lib/format";
import { formularOptionen } from "../optionen";
import { SicherheitFormular } from "../sicherheit-formular";

export default async function NeueSicherheitSeite({ searchParams }: PageProps<"/sicherheiten/neu">) {
  const kontext = await pruefeZugriff("gesellschaften", "schreiben");
  const sicht = await sichtbarkeit(kontext);
  const t = texte(kontext.mandant.sprache);
  const sp = await searchParams;
  const opt = await formularOptionen(kontext, sicht);
  const kredit = typeof sp.kredit === "string" ? opt.kredite.find((k) => k.id === sp.kredit) : undefined;
  const haus = typeof sp.haus === "string" ? opt.haeuser.find((h) => h.id === sp.haus) : undefined;
  return (
    <div className="max-w-4xl">
      <Seitenkopf titel={t.sicherheiten.neu} zurueck={{ href: "/sicherheiten", text: t.sicherheiten.zurueck }} />
      <Karte>
        <SicherheitFormular
          start={{ id: null, art: "GRUNDSCHULD", glaeubiger: kredit?.bank ?? null, betrag: null, rang: null, fundstelle: null, sicherungsgeber: null, gesellschaftId: null, eingetragenAm: null, gueltigBis: null, geloeschtAm: null, quelle: "GRUNDBUCHAUSZUG", stand: null, dokumentId: null, notiz: null, hausIds: haus ? [haus.id] : [], kreditIds: kredit ? [kredit.id] : [] }}
          t={t}
          f={formatierer(kontext.mandant)}
          {...opt}
        />
      </Karte>
    </div>
  );
}
