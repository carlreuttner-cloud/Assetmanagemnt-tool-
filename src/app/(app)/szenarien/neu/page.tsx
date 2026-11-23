import { pruefeZugriff } from "@/lib/auth/kontext";
import { leseParameter } from "../eingabe";
import { SzenarioAnsicht } from "../szenario-ansicht";

export default async function NeuesSzenarioSeite({ searchParams }: PageProps<"/szenarien/neu">) {
  const kontext = await pruefeZugriff("szenarien");
  const sp = await searchParams;
  const { parameter, fehler } = leseParameter(sp, kontext.mandant.sprache);
  const g = typeof sp.g === "string" && sp.g ? sp.g : null;
  return <SzenarioAnsicht kontext={kontext} parameter={parameter} gesellschaftId={g} gespeichert={null} eingabeFehler={fehler} aktion="/szenarien/neu" />;
}
