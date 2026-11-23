import { notFound } from "next/navigation";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { ausJson } from "@/lib/szenario";
import { leseParameter } from "../eingabe";
import { SzenarioAnsicht } from "../szenario-ansicht";

export default async function SzenarioSeite({ params, searchParams }: PageProps<"/szenarien/[id]">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("szenarien");
  const sicht = await sichtbarkeit(kontext);
  const szenario = await kontext.db.szenario.findFirst({
    // Eingeschränkte Rollen sehen nur Szenarien ihrer Gesellschaften, keine Portfolio-Szenarien
    where: { id, ...(sicht.gesellschaftIds === "alle" ? {} : { gesellschaftId: { in: sicht.gesellschaftIds } }) },
  });
  if (!szenario) notFound();
  const sp = await searchParams;
  const eingabe = leseParameter(sp, kontext.mandant.sprache);
  // Geänderte Werte im Formular haben Vorrang vor den gespeicherten
  const parameter = eingabe.vorhanden ? eingabe.parameter : ausJson(szenario.parameter);
  const g = eingabe.vorhanden ? (typeof sp.g === "string" && sp.g ? sp.g : null) : szenario.gesellschaftId;
  return (
    <SzenarioAnsicht
      kontext={kontext}
      parameter={parameter}
      gesellschaftId={g}
      gespeichert={{ id: szenario.id, name: szenario.name, beschreibung: szenario.beschreibung }}
      eingabeFehler={eingabe.fehler}
      aktion={`/szenarien/${szenario.id}`}
    />
  );
}
