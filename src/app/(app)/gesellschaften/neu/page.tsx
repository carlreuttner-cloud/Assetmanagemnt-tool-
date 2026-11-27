import { Karte, Seitenkopf } from "@/components/ui";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { GesellschaftFormular } from "../gesellschaft-formular";

export default async function NeueGesellschaftSeite({ searchParams }: PageProps<"/gesellschaften/neu">) {
  const { portfolio } = await searchParams;
  const kontext = await pruefeZugriff("gesellschaften", "schreiben");
  const t = texte(kontext.mandant.sprache);
  const portfolios = await kontext.db.portfolio.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  return (
    <div className="max-w-3xl">
      <Seitenkopf titel={t.gesellschaften.neu} zurueck={{ href: "/gesellschaften", text: t.gesellschaften.titel }} />
      <Karte>
        <GesellschaftFormular t={t} portfolios={portfolios} portfolioId={typeof portfolio === "string" ? portfolio : undefined} />
      </Karte>
    </div>
  );
}
