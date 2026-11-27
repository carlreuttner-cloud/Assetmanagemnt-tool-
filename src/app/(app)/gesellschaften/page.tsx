import Link from "next/link";
import { GesellschaftenTabelle } from "@/components/gesellschaften-tabelle";
import { Karte, KnopfLink, Seitenkopf } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { ladePortfolioGruppen } from "@/lib/daten/gesellschaften";
import { formatierer } from "@/lib/format";

export default async function GesellschaftenSeite() {
  const kontext = await pruefeZugriff("gesellschaften");
  const t = texte(kontext.mandant.sprache);
  const f = formatierer(kontext.mandant);
  const { stichtag, gruppen, gesamt, gesamtZeilen } = await ladePortfolioGruppen(kontext, { bereich: true });
  const schreiben = darf(kontext.rolle, "gesellschaften", "schreiben");
  // Leere Gruppen nur zeigen, wenn es sonst nichts gibt; "Ohne Portfolio" nur, wenn belegt.
  const belegt = gruppen.filter((g) => g.zeilen.length > 0);
  const mitPortfolios = belegt.some((g) => g.portfolio !== null);

  return (
    <div className="space-y-6">
      <Seitenkopf
        titel={t.gesellschaften.titel}
        beschreibung={t.seiten.gesellschaften}
        aktionen={
          schreiben && (
            <KnopfLink href="/gesellschaften/neu" art="primaer">
              {t.gesellschaften.neu}
            </KnopfLink>
          )
        }
      />
      {!mitPortfolios ? (
        <div className="rounded-xl border border-slate-200 bg-white">
          <GesellschaftenTabelle zeilen={gesamtZeilen} summe={gesamt} summeText={t.gesellschaften.summePortfolio} t={t} f={f} stichtag={stichtag} />
        </div>
      ) : (
        belegt.map((g) => {
          const name = g.portfolio?.name ?? t.portfolios.ohne;
          return (
            <Karte
              key={g.portfolio?.id ?? "ohne"}
              titel={
                g.portfolio ? (
                  <Link href={`/portfolios/${g.portfolio.id}`} className="hover:underline">
                    {name}
                  </Link>
                ) : (
                  name
                )
              }
            >
              {g.portfolio?.beschreibung && <p className="-mt-2 mb-3 text-sm text-slate-500">{g.portfolio.beschreibung}</p>}
              <GesellschaftenTabelle zeilen={g.zeilen} summe={g.summe} summeText={fuelle(t.gesellschaften.summeGruppe, { name })} t={t} f={f} stichtag={stichtag} />
            </Karte>
          );
        })
      )}
    </div>
  );
}
