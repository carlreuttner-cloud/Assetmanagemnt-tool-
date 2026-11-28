import Link from "next/link";
import { Formular } from "@/components/formular";
import { Begriff, Kennzahl } from "@/components/herleitung";
import { Feld, Felder, Karte, Leer, MieteZelle, Seitenkopf, Tabelle, rechts } from "@/components/ui";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { ladePortfolioGruppen } from "@/lib/daten/gesellschaften";
import { formatierer } from "@/lib/format";
import { portfolioSpeichern } from "./aktionen";
import { LeerstandZelle } from "@/components/nutzungsart";

export default async function PortfoliosSeite() {
  const kontext = await pruefeZugriff("gesellschaften");
  const t = texte(kontext.mandant.sprache);
  const f = formatierer(kontext.mandant);
  const tp = t.portfolios;
  const tk = t.kennzahlen;
  const schreiben = darf(kontext.rolle, "gesellschaften", "schreiben");
  // Die Portfolio-Seite zeigt immer alle Portfolios, unabhängig von der gewählten Ansicht.
  const { stichtag, gruppen, gesamt, anzahl } = await ladePortfolioGruppen(kontext);
  // Wer nicht schreiben darf, sieht nur Portfolios mit sichtbaren Gesellschaften; "Ohne Portfolio" nur, wenn belegt.
  const zeilen = gruppen.filter((g) => (g.portfolio ? schreiben || g.zeilen.length > 0 : g.zeilen.length > 0));

  return (
    <div className="space-y-6">
      <Seitenkopf titel={tp.titel} beschreibung={t.seiten.portfolios} />

      <Karte titel={tp.vergleich}>
        {zeilen.length === 0 ? (
          <Leer>{tp.keine}</Leer>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{tp.name}</th>
                <th className={rechts}>{tp.anzahlGesellschaften}</th>
                <th className={rechts}>{tk.haeuser}</th>
                <th className={rechts}>{tk.verkehrswert}</th>
                <th className={rechts}>{tk.restschuld}</th>
                <th className={rechts}>
                  <Begriff k="LTV" t={t} />
                </th>
                <th className={rechts}>
                  {tk.sollMiete} ({t.allgemein.monat} / {t.allgemein.jahr})
                </th>
                <th className={rechts}>{tk.leerstand}</th>
                <th className={rechts}>
                  <Begriff k="DSCR" t={t} />
                </th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map(({ portfolio, zeilen: gs, summe: k }) => (
                <tr key={portfolio?.id ?? "ohne"} className="hover:bg-slate-50">
                  <td>
                    {portfolio ? (
                      <Link href={`/portfolios/${portfolio.id}`} className="font-medium hover:underline">
                        {portfolio.name}
                      </Link>
                    ) : (
                      <span className="font-medium italic text-slate-700">{tp.ohne}</span>
                    )}
                    <div className="text-xs text-slate-500">{portfolio ? portfolio.beschreibung : tp.ohneBeschreibung}</div>
                  </td>
                  <td className={rechts}>{gs.length}</td>
                  <td className={rechts}>{k.haeuser}</td>
                  <td className={rechts}>
                    <Kennzahl art="verkehrswert" k={k} t={t} f={f} stichtag={stichtag} ganz ausrichtung="rechts" />
                  </td>
                  <td className={rechts}>
                    <Kennzahl art="restschuld" k={k} t={t} f={f} stichtag={stichtag} ganz ausrichtung="rechts" />
                  </td>
                  <td className={rechts}>
                    <Kennzahl art="ltv" k={k} t={t} f={f} stichtag={stichtag} ausrichtung="rechts" />
                  </td>
                  <td className={rechts}>
                    <MieteZelle monat={f.betrag(k.sollMonat)} jahr={f.betrag(k.sollJahr)} />
                  </td>
                  <td className={rechts}>{gs.length > 0 ? <LeerstandZelle quote={f.prozent(k.leerstandQuote, 1)} nachArt={k.nachArt} t={t} f={f} /> : t.allgemein.leer}</td>
                  <td className={rechts}>
                    <Kennzahl art="dscr" k={k} t={t} f={f} stichtag={stichtag} ausrichtung="rechts" />
                  </td>
                </tr>
              ))}
            </tbody>
            {zeilen.length > 1 && (
              <tfoot>
                <tr>
                  <td>{t.gesellschaften.summePortfolio}</td>
                  <td className={rechts}>{anzahl}</td>
                  <td className={rechts}>{gesamt.haeuser}</td>
                  <td className={rechts}>
                    <Kennzahl art="verkehrswert" k={gesamt} t={t} f={f} stichtag={stichtag} ganz ausrichtung="rechts" />
                  </td>
                  <td className={rechts}>
                    <Kennzahl art="restschuld" k={gesamt} t={t} f={f} stichtag={stichtag} ganz ausrichtung="rechts" />
                  </td>
                  <td className={rechts}>
                    <Kennzahl art="ltv" k={gesamt} t={t} f={f} stichtag={stichtag} ausrichtung="rechts" />
                  </td>
                  <td className={rechts}>
                    <MieteZelle monat={f.betrag(gesamt.sollMonat)} jahr={f.betrag(gesamt.sollJahr)} />
                  </td>
                  <td className={rechts}>
                    <LeerstandZelle quote={f.prozent(gesamt.leerstandQuote, 1)} nachArt={gesamt.nachArt} t={t} f={f} />
                  </td>
                  <td className={rechts}>
                    <Kennzahl art="dscr" k={gesamt} t={t} f={f} stichtag={stichtag} ausrichtung="rechts" />
                  </td>
                </tr>
              </tfoot>
            )}
          </Tabelle>
        )}
        {!schreiben && <p className="mt-3 text-xs text-slate-500">{tp.nurSichtbare}</p>}
      </Karte>

      {schreiben && (
        <Karte titel={tp.neu} className="max-w-3xl">
          <Formular aktion={portfolioSpeichern.bind(null, null)} absenden={t.allgemein.anlegen}>
            <Felder>
              <Feld name="name" label={tp.name} pflicht />
              <Feld name="beschreibung" label={tp.beschreibung} />
            </Felder>
          </Formular>
        </Karte>
      )}
    </div>
  );
}
