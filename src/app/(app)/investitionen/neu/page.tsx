import { Karte, Seitenkopf } from "@/components/ui";
import { texte } from "@/i18n";
import { bereichsSicht } from "@/lib/auth/auswahl";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { erlaubt } from "@/lib/daten/portfolio";
import { einParam } from "@/lib/filter";
import { formatierer } from "@/lib/format";
import { MassnahmeFormular } from "../massnahme-formular";

export default async function MassnahmeNeuSeite({ searchParams }: PageProps<"/investitionen/neu">) {
  const kontext = await pruefeZugriff("haeuser", "schreiben");
  const t = texte(kontext.mandant.sprache);
  const f = formatierer(kontext.mandant);
  const sp = await searchParams;
  const sicht = await bereichsSicht(kontext);
  const haeuser = await kontext.db.haus.findMany({ where: { id: erlaubt(sicht.hausIds) }, orderBy: { bezeichnung: "asc" }, select: { id: true, bezeichnung: true } });
  return (
    <div className="max-w-3xl space-y-6">
      <Seitenkopf titel={t.massnahmen.neu} zurueck={{ href: "/investitionen", text: t.massnahmen.titel }} />
      <Karte>
        <MassnahmeFormular t={t} f={f} haeuser={haeuser} hausVorwahl={einParam(sp.h)} />
      </Karte>
    </div>
  );
}
