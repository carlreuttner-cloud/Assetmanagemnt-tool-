import { Merken } from "@/components/merken";
import { notFound } from "next/navigation";
import { Formular } from "@/components/formular";
import { GesellschaftenTabelle } from "@/components/gesellschaften-tabelle";
import { KennzahlKacheln } from "@/components/kennzahl-kacheln";
import { Feld, Felder, Karte, Leer, Seitenkopf } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { idFilter, sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { ladePortfolioGruppen } from "@/lib/daten/gesellschaften";
import { formatierer } from "@/lib/format";
import { portfolioLoeschen, portfolioSpeichern, portfolioZuordnen } from "../aktionen";

export default async function PortfolioSeite({ params }: PageProps<"/portfolios/[id]">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("gesellschaften");
  const t = texte(kontext.mandant.sprache);
  const f = formatierer(kontext.mandant);
  const tp = t.portfolios;
  const schreiben = darf(kontext.rolle, "gesellschaften", "schreiben");
  const { stichtag, gruppen } = await ladePortfolioGruppen(kontext);
  const gruppe = gruppen.find((g) => g.portfolio?.id === id);
  // Ohne Schreibrecht nur Portfolios mit sichtbaren Gesellschaften
  if (!gruppe?.portfolio || (!schreiben && gruppe.zeilen.length === 0)) notFound();
  const portfolio = gruppe.portfolio;

  const alle = schreiben
    ? await kontext.db.gesellschaft.findMany({
        where: { id: idFilter((await sichtbarkeit(kontext)).gesellschaftIds) },
        orderBy: { name: "asc" },
        select: { id: true, name: true, portfolio: { select: { id: true, name: true } } },
      })
    : [];

  return (
    <div className="space-y-6">
      <Seitenkopf
        titel={portfolio.name}
        beschreibung={portfolio.beschreibung}
        zurueck={{ href: "/portfolios", text: tp.titel }}
        aktionen={<Merken kontext={kontext} t={t} art="portfolio" pfad={`/portfolios/${id}`} titel={portfolio.name} />}
      />

      <KennzahlKacheln k={gruppe.summe} t={t} f={f} stichtag={stichtag} />

      <Karte titel={tp.gesellschaften}>
        {gruppe.zeilen.length === 0 ? (
          <Leer>{tp.leer}</Leer>
        ) : (
          <GesellschaftenTabelle zeilen={gruppe.zeilen} summe={gruppe.summe} summeText={fuelle(t.gesellschaften.summeGruppe, { name: portfolio.name })} t={t} f={f} stichtag={stichtag} />
        )}
      </Karte>

      {schreiben && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Karte titel={tp.zuordnen}>
            <p className="mb-3 text-sm text-slate-600">{tp.zuordnenHinweis}</p>
            <Formular aktion={portfolioZuordnen.bind(null, id)} absenden={tp.zuordnungSpeichern}>
              <ul className="space-y-2">
                {alle.map((g) => (
                  <li key={g.id}>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="gesellschaft" value={g.id} defaultChecked={g.portfolio?.id === id} className="h-4 w-4 rounded border-slate-300" />
                      <span className="font-medium text-slate-800">{g.name}</span>
                      {g.portfolio && g.portfolio.id !== id && <span className="text-xs text-slate-500">({fuelle(tp.bisher, { name: g.portfolio.name })})</span>}
                    </label>
                  </li>
                ))}
              </ul>
            </Formular>
          </Karte>
          <div className="space-y-6">
            <Karte titel={tp.stammdaten}>
              <Formular aktion={portfolioSpeichern.bind(null, id)} absenden={t.allgemein.speichern}>
                <Felder>
                  <Feld name="name" label={tp.name} wert={portfolio.name} pflicht />
                  <Feld name="beschreibung" label={tp.beschreibung} wert={portfolio.beschreibung} />
                </Felder>
              </Formular>
            </Karte>
            <Formular aktion={portfolioLoeschen.bind(null, id)} absenden={tp.loeschen} art="gefahr" bestaetigen={tp.loeschenBestaetigen} />
          </div>
        </div>
      )}
    </div>
  );
}
