import Link from "next/link";
import type { ReactNode } from "react";
import { Liniendiagramm } from "@/components/diagramme";
import { Begriff, Glossar, MitHerleitung, Unbekannt } from "@/components/herleitung";
import { Kachel, Kacheln, Karte, Leer, Marke, Seitenkopf, Tabelle, rechts } from "@/components/ui";
import { fuelle, texte, type Texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { bewerteHaus, portfolioJahre, portfolioStand, type HausBewertung, type Teilsumme } from "@/lib/bewertung";
import { heute } from "@/lib/datum";
import { ladeBewertung } from "@/lib/daten/bewertung";
import { formatierer, type Formatierer } from "@/lib/format";
import type { Decimal } from "@/lib/geld";

export default async function BewertungSeite() {
  const kontext = await pruefeZugriff("haeuser");
  const t = texte(kontext.mandant.sprache);
  const tb = t.bewertung;
  const f = formatierer(kontext.mandant);
  const stichtag = heute();
  const { haeuser, portfolios, auswahl } = await ladeBewertung(kontext);

  const stand = portfolioStand(haeuser, stichtag);
  const jahre = portfolioJahre(haeuser, stichtag);
  const spanne = (von: string | null, bis: string | null) => (von && bis ? (von === bis ? f.datum(von) : fuelle(tb.stichtage, { von: f.datum(von), bis: f.datum(bis) })) : null);
  const summe = (s: Teilsumme, formel: string, extra?: string) => (
    <Summe s={s} formel={formel} stichtag={spanne(stand.stichtageVon, stand.stichtageBis)} extra={extra} t={t} f={f} />
  );

  // Diagramm nur aus vollständigen Jahren: unvollständige Summen würden einen Wertverlust vortäuschen.
  const punkt = (j: (typeof jahre)[number], s: Teilsumme) => ({ x: j.stichtag, y: s.vollstaendig ? s.summe : null });
  const reihen = [
    { name: tb.diagrammSumme, punkte: jahre.map((j) => punkt(j, j.wert)) },
    { name: tb.diagrammBoden, punkte: jahre.map((j) => punkt(j, j.bodenwert)), gestrichelt: true },
    { name: tb.diagrammGebaeude, punkte: jahre.map((j) => punkt(j, j.gebaeudewert)), gestrichelt: true },
  ];

  const gruppen =
    auswahl.art === "alle"
      ? [...portfolios.map((p) => ({ id: p.id, name: p.name })), { id: null, name: tb.ohnePortfolio }]
          .map((p) => ({ ...p, haeuser: haeuser.filter((h) => h.gesellschaft.portfolioId === p.id) }))
          .filter((p) => p.haeuser.length > 0)
      : [];

  return (
    <div className="space-y-6">
      <Seitenkopf titel={tb.titel} beschreibung={tb.beschreibung} />
      {haeuser.length === 0 ? (
        <Karte>
          <Leer>{tb.keine}</Leer>
        </Karte>
      ) : (
        <>
          <Kacheln>
            <Kachel titel={tb.kachelWert} wert={summe(stand.wert, tb.summeFormel)} unter={tb.kachelWertUnter} />
            <Kachel titel={<Begriff k="Bodenwert" t={t}>{tb.kachelBoden}</Begriff>} wert={summe(stand.bodenwert, tb.bodenFormel)} unter={tb.kachelAusGutachten} />
            <Kachel
              titel={<Begriff k="Gebaeudewert" t={t}>{tb.kachelGebaeude}</Begriff>}
              wert={summe(stand.gebaeudewert, tb.gebaeudeFormel, stand.gebaeudewert.abgeleitet ? fuelle(tb.abgeleitetAnzahl, { anzahl: stand.gebaeudewert.abgeleitet }) : undefined)}
              unter={tb.kachelAusGutachten}
            />
            <Kachel titel={t.gutachten.letztes} wert={fuelle(tb.vonHaeusern, { bekannt: stand.verkehrswertGutachten.bekannt, gesamt: stand.verkehrswertGutachten.gesamt })} />
          </Kacheln>

          <Karte titel={tb.jahre}>
            <p className="mb-3 text-xs text-slate-500">{tb.jahreHinweis}</p>
            {jahre.some((j) => j.wert.vollstaendig) && (
              <div className="mb-4 max-w-3xl">
                <h3 className="mb-1 text-sm font-medium">{tb.diagrammJahre}</h3>
                <Liniendiagramm reihen={reihen} formatY={(w) => f.betragKurz(w)} formatX={(d) => d.slice(0, 4)} ab0 />
              </div>
            )}
            <Tabelle>
              <thead>
                <tr>
                  <th>{tb.jahr}</th>
                  <th className={rechts}>{tb.wert}</th>
                  <th className={rechts}>{tb.veraenderungVorjahr}</th>
                  <th className={rechts}>{tb.kachelBoden}</th>
                  <th className={rechts}>{tb.kachelGebaeude}</th>
                  <th>{tb.haeuserMitWert}</th>
                  <th>{tb.stichtagSpanne}</th>
                </tr>
              </thead>
              <tbody>
                {[...jahre].reverse().map((j) => {
                  const sp = spanne(j.stichtageVon, j.stichtageBis);
                  return (
                    <tr key={j.jahr}>
                      <td>{f.datum(j.stichtag)}</td>
                      <td className={rechts}>
                        <Summe s={j.wert} formel={tb.summeFormel} stichtag={sp} t={t} f={f} />
                      </td>
                      <td className={rechts}>
                        <Veraenderung wert={j.veraenderung} prozent={null} f={f} />
                      </td>
                      <td className={rechts}>
                        <Summe s={j.bodenwert} formel={tb.bodenFormel} stichtag={sp} t={t} f={f} />
                      </td>
                      <td className={rechts}>
                        <Summe s={j.gebaeudewert} formel={tb.gebaeudeFormel} stichtag={sp} t={t} f={f} />
                      </td>
                      <td>{fuelle(tb.vonHaeusern, { bekannt: j.wert.bekannt, gesamt: j.wert.gesamt })}</td>
                      <td className="text-xs text-slate-600">{sp ?? "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Tabelle>
          </Karte>

          {gruppen.length > 1 && (
            <Karte titel={tb.portfolios}>
              <Tabelle>
                <thead>
                  <tr>
                    <th>{tb.portfolio}</th>
                    <th className={rechts}>{tb.kachelWert}</th>
                    <th className={rechts}>{tb.kachelBoden}</th>
                    <th className={rechts}>{tb.kachelGebaeude}</th>
                    <th>{tb.haeuserMitWert}</th>
                    <th>{tb.stichtagSpanne}</th>
                  </tr>
                </thead>
                <tbody>
                  {gruppen.map((g) => {
                    const s = portfolioStand(g.haeuser, stichtag);
                    const sp = spanne(s.stichtageVon, s.stichtageBis);
                    return (
                      <tr key={g.id ?? "ohne"}>
                        <td>{g.id ? <Link href={`/portfolios/${g.id}`} className="font-medium hover:underline">{g.name}</Link> : g.name}</td>
                        <td className={rechts}>
                          <Summe s={s.wert} formel={tb.summeFormel} stichtag={sp} t={t} f={f} />
                        </td>
                        <td className={rechts}>
                          <Summe s={s.bodenwert} formel={tb.bodenFormel} stichtag={sp} t={t} f={f} />
                        </td>
                        <td className={rechts}>
                          <Summe s={s.gebaeudewert} formel={tb.gebaeudeFormel} stichtag={sp} t={t} f={f} />
                        </td>
                        <td>{fuelle(tb.vonHaeusern, { bekannt: s.wert.bekannt, gesamt: s.wert.gesamt })}</td>
                        <td className="text-xs text-slate-600">{sp ?? "–"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </Tabelle>
            </Karte>
          )}

          <Karte titel={tb.haeuser}>
            <Tabelle>
              <thead>
                <tr>
                  <th>{tb.haus}</th>
                  <th>{tb.gesellschaft}</th>
                  <th className={rechts}>{tb.letztesGutachten}</th>
                  <th className={rechts}>{tb.kachelBoden}</th>
                  <th className={rechts}>{tb.kachelGebaeude}</th>
                  <th className={rechts}>{tb.vorgutachten}</th>
                  <th className={rechts}>{tb.veraenderung}</th>
                  <th className={rechts}>{tb.marktwert}</th>
                </tr>
              </thead>
              <tbody>
                {haeuser.map((h) => {
                  const b = bewerteHaus(h.gutachten, h.marktwerte);
                  return (
                    <tr key={h.hausId} className="hover:bg-slate-50">
                      <td>
                        <Link href={`/haeuser/${h.hausId}/gutachten`} className="font-medium hover:underline">
                          {h.bezeichnung}
                        </Link>
                        {h.ort && <div className="text-xs text-slate-500">{h.ort}</div>}
                      </td>
                      <td>
                        <Link href={`/gesellschaften/${h.gesellschaft.id}`} className="hover:underline">
                          {h.gesellschaft.name}
                        </Link>
                      </td>
                      <td className={rechts}>
                        {b.letztes ? (
                          <MitHerleitung
                            wert={f.betragGanz(b.letztes.verkehrswert)}
                            herleitung={{ quelle: b.letztes.gutachter ?? t.gutachten.titel, stichtag: f.datum(b.letztes.stichtag) }}
                            t={t}
                            ausrichtung="rechts"
                          />
                        ) : (
                          <span className="text-xs italic text-slate-400">{tb.keinGutachten}</span>
                        )}
                      </td>
                      <td className={rechts}>{b.letztes ? b.letztes.bodenwert ? f.betragGanz(b.letztes.bodenwert) : <Unbekannt t={t} /> : "–"}</td>
                      <td className={rechts}>{b.letztes ? <GebaeudeWert b={b} t={t} f={f} /> : "–"}</td>
                      <td className={rechts}>
                        {b.vorher ? (
                          <MitHerleitung
                            wert={f.betragGanz(b.vorher.verkehrswert)}
                            herleitung={{ quelle: b.vorher.gutachter ?? t.gutachten.titel, stichtag: f.datum(b.vorher.stichtag) }}
                            t={t}
                            ausrichtung="rechts"
                          />
                        ) : (
                          <span className="text-xs italic text-slate-400">{tb.keinVorgutachten}</span>
                        )}
                      </td>
                      <td className={rechts}>
                        {b.veraenderung && b.letztes && b.vorher ? (
                          <MitHerleitung
                            wert={<Veraenderung wert={b.veraenderung} prozent={b.veraenderungProzent} f={f} />}
                            herleitung={{
                              berechnung: tb.veraenderungFormel,
                              werte: [
                                [`${tb.letztesGutachten} (${f.datum(b.letztes.stichtag)})`, f.betragGanz(b.letztes.verkehrswert)],
                                [`${tb.vorgutachten} (${f.datum(b.vorher.stichtag)})`, f.betragGanz(b.vorher.verkehrswert)],
                              ],
                            }}
                            t={t}
                            ausrichtung="rechts"
                          />
                        ) : (
                          "–"
                        )}
                      </td>
                      <td className={rechts}>
                        {b.marktwert ? (
                          <MitHerleitung
                            wert={f.betragGanz(b.marktwert.wert)}
                            herleitung={{ quelle: b.marktwert.quelle ?? t.allgemein.unbekannt, stichtag: f.datum(b.marktwert.stichtag) }}
                            t={t}
                            ausrichtung="rechts"
                          />
                        ) : (
                          tb.keinMarktwert
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Tabelle>
          </Karte>
        </>
      )}
      <Glossar begriffe={["Bodenwert", "Gebaeudewert", "Marktwert"]} t={t} />
    </div>
  );
}

/** Summe mit Zählung und Stichtagsspanne; unvollständige Summen sind gekennzeichnet. */
function Summe({ s, formel, stichtag, extra, t, f }: { s: Teilsumme; formel: string; stichtag: ReactNode; extra?: string; t: Texte; f: Formatierer }) {
  const tb = t.bewertung;
  if (s.summe === null) return <Unbekannt t={t} />;
  return (
    <MitHerleitung
      wert={
        <>
          {f.betragGanz(s.summe)}
          {!s.vollstaendig && (
            <>
              {" "}
              <Marke ton="warnung">{tb.unvollstaendig}</Marke>
            </>
          )}
        </>
      }
      herleitung={{
        berechnung: formel,
        werte: [[tb.haeuserMitWert, fuelle(tb.vonHaeusern, { bekannt: s.bekannt, gesamt: s.gesamt })], ...(extra ? [["", extra] as [string, string]] : [])],
        stichtag: stichtag ?? undefined,
        fehlt: s.vollstaendig ? [] : [fuelle(tb.unvollstaendigHinweis, { bekannt: s.bekannt, gesamt: s.gesamt })],
        hinweis: tb.stichtageHinweis,
      }}
      t={t}
      ausrichtung="rechts"
    />
  );
}

function GebaeudeWert({ b, t, f }: { b: HausBewertung; t: Texte; f: Formatierer }) {
  const tg = t.gutachten;
  const g = b.letztes!;
  if (!b.gebaeude.wert) return <Unbekannt t={t} />;
  return (
    <MitHerleitung
      wert={
        <>
          {f.betragGanz(b.gebaeude.wert)}
          {b.gebaeude.art === "abgeleitet" && <span className="ml-1 text-xs text-slate-500">({tg.gebaeudewertAbgeleitet})</span>}
        </>
      }
      herleitung={
        b.gebaeude.art === "gutachten"
          ? { berechnung: tg.gebaeudewertLautGutachten, quelle: g.gutachter ?? tg.titel, stichtag: f.datum(g.stichtag) }
          : {
              berechnung: tg.gebaeudewertFormel,
              werte: [
                [tg.verkehrswert, f.betragGanz(g.verkehrswert)],
                [tg.bodenwert, f.betragGanz(g.bodenwert)],
              ],
              quelle: g.gutachter ?? tg.titel,
              stichtag: f.datum(g.stichtag),
            }
      }
      t={t}
      ausrichtung="rechts"
    />
  );
}

function Veraenderung({ wert, prozent, f }: { wert: Decimal | null; prozent: Decimal | null; f: Formatierer }) {
  if (!wert) return <span className="text-slate-400">–</span>;
  const ton = wert.isNegative() ? "text-red-700" : wert.isZero() ? "text-slate-600" : "text-emerald-700";
  const vz = wert.isNegative() ? "" : "+";
  return (
    <span className={ton}>
      {vz}
      {f.betragGanz(wert)}
      {prozent && ` (${vz}${f.prozent(prozent, 1)})`}
    </span>
  );
}
