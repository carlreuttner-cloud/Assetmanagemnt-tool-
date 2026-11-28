import { Begriff, Glossar, MitHerleitung, Unbekannt } from "@/components/herleitung";
import { Auswahl, Felder, Kachel, Kacheln, Karte, Leer, Marke, Seitenkopf, Tabelle, knopfKlasse, rechts, type Ton } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { heute } from "@/lib/datum";
import { ladeInvestoren, ladePortal } from "@/lib/daten/portal";
import { formatierer } from "@/lib/format";
import { dezimal } from "@/lib/geld";
import type { PositionStatus } from "@/lib/kapitalabruf";

const ABRUF_TON: Record<PositionStatus, Ton> = { offen: "neutral", teilweise: "warnung", bezahlt: "gut", ueberzahlt: "warnung" };

export default async function PortalSeite({ searchParams }: PageProps<"/portal">) {
  const kontext = await pruefeZugriff("investorenportal");
  const t = texte(kontext.mandant.sprache);
  const tp = t.portal;
  const tr = t.renditen;
  const f = formatierer(kontext.mandant);
  const sp = await searchParams;
  const istInvestor = kontext.rolle === "INVESTOR";
  const als = !istInvestor && typeof sp.als === "string" ? sp.als : undefined;
  const [investoren, portal] = await Promise.all([istInvestor ? Promise.resolve([]) : ladeInvestoren(kontext), ladePortal(kontext, als)]);
  const stichtag = heute();
  const null0 = dezimal(0);
  const summe = (w: (k: NonNullable<typeof portal>["konten"][number]) => ReturnType<typeof dezimal>) => portal?.konten.reduce((s, k) => s.plus(w(k)), null0) ?? null0;
  const offen = summe((k) => k.abrufe.reduce((s, a) => s.plus(a.stand.offen), null0));
  const ueberfaellig = portal?.konten.flatMap((k) => k.abrufe).filter((a) => a.stand.ueberfaellig).length ?? 0;
  const ohneDatum = portal?.konten.reduce((n, k) => n + k.summen.ohneDatum, 0) ?? 0;
  const vorschauParam = als ? `?als=${als}` : "";
  const quelle = `${tp.quelleKonto}; ${t.herleitung.stichtag} ${fuelle(tp.stichtagHeute, { datum: f.datum(stichtag) })}`;

  return (
    <div className="max-w-6xl space-y-6">
      <Seitenkopf titel={portal ? fuelle(tp.willkommen, { name: portal.investor }) : t.navigation.portal} beschreibung={t.seiten.portal} />

      {!istInvestor && (
        <Karte titel={tp.vorschau}>
          <p className="-mt-2 mb-3 text-sm text-slate-600">{tp.vorschauHinweis}</p>
          {investoren.length === 0 ? (
            <Leer>{tp.keineInvestoren}</Leer>
          ) : (
            <form method="get" className="flex flex-wrap items-end gap-3">
              <Felder>
                <Auswahl name="als" label={tp.vorschauWaehlen} wert={als} optionen={investoren.map((i) => ({ wert: i.id, text: i.name }))} pflicht />
              </Felder>
              <button type="submit" className={knopfKlasse("sekundaer")}>
                {tp.anzeigen}
              </button>
            </form>
          )}
        </Karte>
      )}

      {portal && portal.gesellschaften.length === 0 && <Leer>{tp.keinZugang}</Leer>}
      {portal && portal.gesellschaften.length > 0 && (
        <>
          <Kacheln>
            <Kachel titel={tp.kacheln.einlagen} wert={f.betragGanz(summe((k) => k.summen.einlagen))} unter={ohneDatum > 0 ? fuelle(tp.ohneDatum, { anzahl: ohneDatum }) : undefined} />
            <Kachel titel={tp.kacheln.rueckfluesse} wert={f.betragGanz(summe((k) => k.summen.rueckzahlungen.plus(k.summen.ausschuettungen)))} />
            <Kachel titel={<Begriff k="Kapitalsaldo" t={t}>{tp.kacheln.saldo}</Begriff>} wert={f.betragGanz(summe((k) => k.summen.saldo))} />
            <Kachel titel={tp.kacheln.offen} wert={f.betragGanz(offen)} ton={ueberfaellig > 0 ? "schlecht" : undefined} unter={ueberfaellig > 0 ? fuelle(t.kapitalabrufe.ueberfaelligAnzahl, { anzahl: ueberfaellig }) : undefined} />
          </Kacheln>

          <Karte titel={tp.beteiligungen}>
            {portal.gesellschaften
              .filter((g) => !g.mitKonto)
              .map((g) => (
                <p key={g.id} className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {fuelle(tp.keinKonto, { gesellschaft: g.name })}
                </p>
              ))}
            {portal.konten.length > 0 && (
              <Tabelle>
                <thead>
                  <tr>
                    <th>{tp.spalten.gesellschaft}</th>
                    <th className={rechts}>{tp.spalten.beteiligung}</th>
                    <th className={rechts}>{tp.spalten.einlagen}</th>
                    <th className={rechts}>{tp.spalten.rueckzahlungen}</th>
                    <th className={rechts}>{tp.spalten.ausschuettungen}</th>
                    <th className={rechts}>{tp.spalten.saldo}</th>
                    <th className={rechts}>
                      <Begriff k="EkMultiple" t={t}>{tp.spalten.multiple}</Begriff>
                    </th>
                    <th className={rechts}>
                      <Begriff k="IRR" t={t}>{tp.spalten.irr}</Begriff>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {portal.konten.map((k) => (
                    <tr key={k.id} data-konto={k.gesellschaft}>
                      <td>
                        {k.gesellschaft}
                        <div className="text-xs text-slate-500">{k.name}</div>
                      </td>
                      <td className={rechts}>{k.beteiligungProzent === null ? <Unbekannt t={t} /> : f.prozent(k.beteiligungProzent, 2)}</td>
                      <td className={rechts}>{f.betragGanz(k.summen.einlagen)}</td>
                      <td className={rechts}>{f.betragGanz(k.summen.rueckzahlungen)}</td>
                      <td className={rechts}>{f.betragGanz(k.summen.ausschuettungen)}</td>
                      <td className={rechts}>
                        <MitHerleitung
                          wert={f.betragGanz(k.summen.saldo)}
                          herleitung={{ berechnung: t.glossar.Kapitalsaldo.lang, werte: [[tp.spalten.einlagen, f.betragGanz(k.summen.einlagen)], [tp.spalten.rueckzahlungen, f.betragGanz(k.summen.rueckzahlungen)], [tp.spalten.ausschuettungen, f.betragGanz(k.summen.ausschuettungen)]], quelle }}
                          t={t}
                          ausrichtung="rechts"
                        />
                      </td>
                      <td className={rechts}>
                        <MitHerleitung
                          wert={k.rendite.multiple === null ? <Unbekannt t={t} /> : f.faktor(k.rendite.multiple)}
                          herleitung={{ berechnung: tr.herleitungMultiple, werte: [[tr.rueckzahlungen, f.betragGanz(k.rendite.rueckzahlungen)], [tr.ausschuettungen, f.betragGanz(k.rendite.ausschuettungen)], [tp.spalten.einlagen, f.betragGanz(k.rendite.einlagen)]], quelle, hinweis: tr.ohneRestwert }}
                          t={t}
                          ausrichtung="rechts"
                        />
                      </td>
                      <td className={rechts}>
                        <MitHerleitung
                          wert={k.rendite.irr === null ? <span className="text-xs text-slate-500">{k.rendite.irrGrund ? tr.irrGruende[k.rendite.irrGrund] : "–"}</span> : f.prozent(k.rendite.irr, 1)}
                          herleitung={{
                            berechnung: tr.herleitungIrr,
                            werte: k.rendite.ersteZahlung && k.rendite.letzteZahlung ? [[tr.spalten.zeitraum, fuelle(tr.zeitraum, { von: f.datum(k.rendite.ersteZahlung), bis: f.datum(k.rendite.letzteZahlung), anzahl: k.rendite.anzahl })]] : [],
                            quelle,
                            hinweis: k.rendite.ohneDatum > 0 ? fuelle(tr.ohneDatum, { anzahl: k.rendite.ohneDatum }) : tr.ohneRestwert,
                          }}
                          t={t}
                          ausrichtung="rechts"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Tabelle>
            )}
          </Karte>

          {portal.konten.some((k) => k.abrufe.length > 0) && (
            <Karte titel={tp.abrufe}>
              <Tabelle>
                <thead>
                  <tr>
                    <th>{tp.spalten.abruf}</th>
                    <th>{tp.spalten.faellig}</th>
                    <th className={rechts}>{tp.spalten.betrag}</th>
                    <th className={rechts}>{tp.spalten.offen}</th>
                    <th>{tp.spalten.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {portal.konten.flatMap((k) =>
                    k.abrufe.map((a) => (
                      <tr key={a.id}>
                        <td>
                          {a.bezeichnung}
                          <div className="text-xs text-slate-500">{k.gesellschaft}</div>
                        </td>
                        <td>{f.datum(a.faelligAm)}</td>
                        <td className={rechts}>{f.betrag(a.betrag)}</td>
                        <td className={rechts}>{f.betrag(a.stand.offen)}</td>
                        <td>
                          <Marke ton={ABRUF_TON[a.stand.status]}>{t.kapitalabrufe.status[a.stand.status]}</Marke> {a.stand.ueberfaellig && <Marke ton="schlecht">{t.kapitalabrufe.ueberfaellig}</Marke>}
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </Tabelle>
            </Karte>
          )}

          <Karte titel={tp.berichte}>
            {portal.berichte.length === 0 ? (
              <Leer>{tp.keineBerichte}</Leer>
            ) : (
              <Tabelle>
                <thead>
                  <tr>
                    <th>{tp.spalten.bericht}</th>
                    <th>{tp.spalten.stichtag}</th>
                    <th>{tp.spalten.freigegeben}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {portal.berichte.map((b) => (
                    <tr key={b.id}>
                      <td>
                        {fuelle(t.quartalsbericht.quartalWert, { quartal: b.quartal, jahr: b.jahr })}
                        <div className="text-xs text-slate-500">{b.gesellschaft}</div>
                      </td>
                      <td>{f.datum(b.stichtag)}</td>
                      <td>{b.freigegebenAm ? f.datum(b.freigegebenAm.toISOString().slice(0, 10)) : "–"}</td>
                      <td className={rechts}>
                        <a href={`/api/quartalsbericht/${b.id}`} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">
                          {tp.oeffnen}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Tabelle>
            )}
          </Karte>

          <Karte titel={tp.dokumente}>
            {portal.dokumente.length === 0 ? (
              <Leer>{tp.keineDokumente}</Leer>
            ) : (
              <Tabelle>
                <thead>
                  <tr>
                    <th>{tp.spalten.dokument}</th>
                    <th>{tp.spalten.zuordnung}</th>
                    <th>{tp.spalten.datum}</th>
                    <th>{tp.spalten.freigegeben}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {portal.dokumente.map((d) => (
                    <tr key={d.id} data-dokument={d.titel}>
                      <td>
                        {d.titel}
                        {d.kategorie && <div className="text-xs text-slate-500">{d.kategorie}</div>}
                      </td>
                      <td className="text-sm">{d.zuordnung}</td>
                      <td>{d.dokumentDatum ? f.datum(d.dokumentDatum) : d.jahr ?? "–"}</td>
                      <td>{f.datum(d.freigegebenAm.toISOString().slice(0, 10))}</td>
                      <td className={rechts}>
                        <a href={`/api/portal/dokumente/${d.id}${vorschauParam}`} target="_blank" rel="noreferrer" className="text-sky-700 hover:underline">
                          {tp.oeffnen}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Tabelle>
            )}
          </Karte>

          {portal.konten.map((k) => (
            <Karte key={k.id} titel={fuelle(tp.bewegungen, { name: k.name, gesellschaft: k.gesellschaft })}>
              {k.bewegungen.length === 0 ? (
                <Leer>{t.waterfall.keineBewegungen}</Leer>
              ) : (
                <Tabelle>
                  <thead>
                    <tr>
                      <th>{tp.spalten.datum}</th>
                      <th>{tp.spalten.art}</th>
                      <th className={rechts}>{tp.spalten.betrag}</th>
                      <th>{tp.spalten.quelle}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {k.bewegungen.map((b) => (
                      <tr key={b.id}>
                        <td>{b.datum ? f.datum(b.datum) : <span className="text-xs italic text-amber-700">{t.waterfall.datumUnbekannt}</span>}</td>
                        <td>{t.waterfall.arten[b.art]}</td>
                        <td className={rechts}>{f.betrag(b.betrag)}</td>
                        <td className="text-sm">{b.quelle ?? "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </Tabelle>
              )}
            </Karte>
          ))}
          <Glossar begriffe={["Kapitalsaldo", "EkMultiple", "IRR"]} t={t} />
        </>
      )}
    </div>
  );
}
