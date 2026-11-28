import Link from "next/link";
import { Balkendiagramm } from "@/components/diagramme";
import { Begriff, Glossar, Hinweismarke, MitHerleitung, Unbekannt } from "@/components/herleitung";
import { Karte, KnopfLink, Leer, Marke, Seitenkopf, Tabelle, knopfKlasse, rechts } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { vergleicheAngebote, vergleichsMonate, type AngebotErgebnis } from "@/lib/bankangebot";
import { heute, monatsanfang, monatsNummer } from "@/lib/datum";
import { alsAngebotDaten, angebotFilter, ladeReferenzwerte } from "@/lib/daten/bankangebote";
import { formatierer } from "@/lib/format";
import type { Decimal } from "@/lib/geld";

const MAX_VERGLEICH = 4;

export default async function BankangeboteSeite({ searchParams }: PageProps<"/kredite/angebote">) {
  const kontext = await pruefeZugriff("gesellschaften", "schreiben");
  const sicht = await sichtbarkeit(kontext);
  const t = texte(kontext.mandant.sprache);
  const tb = t.bankangebote;
  const f = formatierer(kontext.mandant);
  const sp = await searchParams;

  const angebote = await kontext.db.bankangebot.findMany({
    where: angebotFilter(sicht),
    orderBy: [{ status: "desc" }, { erstelltAm: "desc" }],
    include: { gesellschaft: { select: { name: true } }, kredit: { select: { bezeichnung: true } } },
  });
  const bestaetigt = angebote.filter((a) => a.status === "BESTAETIGT");
  const entwuerfe = angebote.filter((a) => a.status === "ENTWURF");

  const gewuenscht = [sp.ids].flat().filter((x): x is string => typeof x === "string");
  const auswahl = (gewuenscht.length ? bestaetigt.filter((a) => gewuenscht.includes(a.id)) : bestaetigt).slice(0, MAX_VERGLEICH);
  const daten = auswahl.map(alsAngebotDaten);
  const jahreParam = Number(Array.isArray(sp.jahre) ? sp.jahre[0] : sp.jahre);
  const monate = Number.isInteger(jahreParam) && jahreParam >= 1 && jahreParam <= 40 ? jahreParam * 12 : vergleichsMonate(daten);
  const start = monatsanfang(monatsNummer(heute()) + 1);
  const ergebnisse = vergleicheAngebote(daten, monate, start, await ladeReferenzwerte(kontext));
  const jahre = f.zahl(String(monate / 12), monate % 12 ? 1 : 0);

  const zeile = (a: (typeof angebote)[number]) => (
    <tr key={a.id} data-angebot={a.status}>
      <td>
        <Link href={`/kredite/angebote/${a.id}`} className="font-medium hover:underline">
          {a.bank}
        </Link>
        {a.bezeichnung && <div className="text-xs text-slate-500">{a.bezeichnung}</div>}
      </td>
      <td>{[a.gesellschaft?.name, a.kredit?.bezeichnung].filter(Boolean).join(" · ") || "–"}</td>
      <td className={rechts}>{a.betrag ? f.betragGanz(a.betrag) : <Unbekannt t={t} />}</td>
      <td className={rechts}>
        {a.zinsArt === "FEST" ? (a.sollzins ? f.prozent(a.sollzins) : <Unbekannt t={t} />) : `${a.referenzzins ?? "?"} + ${a.marge ? f.prozent(a.marge) : "?"}`}
      </td>
      <td className={rechts}>{a.zinsbindungMonate ? fuelle(tb.monateWert, { monate: a.zinsbindungMonate, jahre: f.zahl(String(a.zinsbindungMonate / 12), a.zinsbindungMonate % 12 ? 1 : 0) }) : "–"}</td>
      <td>{a.gueltigBis ? f.datum(a.gueltigBis) : "–"}</td>
      <td>
        <Marke ton={a.status === "BESTAETIGT" ? "gut" : "warnung"}>{tb.stati[a.status]}</Marke>
      </td>
    </tr>
  );
  const kopf = (
    <thead>
      <tr>
        <th>{tb.spalten.bank}</th>
        <th>{tb.spalten.bezug}</th>
        <th className={rechts}>{tb.spalten.betrag}</th>
        <th className={rechts}>{tb.spalten.zins}</th>
        <th className={rechts}>
          <Begriff k="Zinsbindung" t={t}>
            {tb.spalten.zinsbindung}
          </Begriff>
        </th>
        <th>{tb.spalten.gueltig}</th>
        <th>{tb.spalten.status}</th>
      </tr>
    </thead>
  );

  const betrag = (w: Decimal | null, herleitung: Parameters<typeof MitHerleitung>[0]["herleitung"], e: AngebotErgebnis) =>
    w === null ? <Unbekannt t={t} grund={e.luecken.map((l) => tb.luecken[l]).join(" · ")} /> : <MitHerleitung wert={f.betragGanz(w)} herleitung={herleitung} t={t} ausrichtung="rechts" />;

  return (
    <div className="max-w-7xl space-y-6">
      <Seitenkopf
        titel={t.navigation.bankangebote}
        beschreibung={t.seiten.bankangebote}
        aktionen={
          <KnopfLink href="/kredite/angebote/neu" art="primaer">
            {tb.neu}
          </KnopfLink>
        }
      />

      {angebote.length === 0 && <Leer>{tb.leer}</Leer>}

      {bestaetigt.length > 0 && (
        <Karte titel={tb.bestaetigte}>
          <form method="get" className="space-y-3">
            <p className="text-sm text-slate-600">{tb.auswahlHinweis}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {bestaetigt.map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="ids" value={a.id} defaultChecked={auswahl.some((x) => x.id === a.id)} />
                  {a.bank}
                  {a.bezeichnung ? ` – ${a.bezeichnung}` : ""}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-sm">
                <span className="block text-slate-700">{tb.zeitraum}</span>
                <input type="number" name="jahre" min={1} max={40} defaultValue={monate % 12 ? undefined : monate / 12} className="mt-1 w-24 rounded-md border border-slate-300 px-2 py-1" />
              </label>
              <button type="submit" className={knopfKlasse("sekundaer")}>
                {tb.vergleichen}
              </button>
            </div>
          </form>
          <div className="mt-4">
            <Tabelle>
              {kopf}
              <tbody>{bestaetigt.map(zeile)}</tbody>
            </Tabelle>
          </div>
        </Karte>
      )}

      {bestaetigt.length > 0 && (
        <Karte titel={fuelle(tb.vergleichTitel, { jahre, start: f.datum(start) })}>
          <p className="mb-4 text-sm text-slate-600">{tb.vergleichHinweis}</p>
          {auswahl.length === 0 ? (
            <Leer>{tb.keineAuswahl}</Leer>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-vergleich>
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                      <th className="py-2 pr-4 font-medium" />
                      {auswahl.map((a) => (
                        <th key={a.id} className="py-2 pr-4 text-right font-medium text-slate-800">
                          {a.bank}
                          {a.bezeichnung && <div className="font-normal text-slate-500">{a.bezeichnung}</div>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 align-top">
                    {(
                      [
                        [tb.zeilen.betrag, (a) => (a.betrag ? f.betragGanz(a.betrag) : <Unbekannt t={t} />)],
                        [
                          tb.zeilen.zinssatz,
                          (a, e) =>
                            e.zinssatz === null ? (
                              <Unbekannt t={t} grund={e.luecken.map((l) => tb.luecken[l]).join(" · ")} />
                            ) : (
                              <MitHerleitung
                                wert={
                                  <>
                                    {f.prozent(e.zinssatz)}
                                    {e.zinsHerkunft?.art === "variabel" && <Hinweismarke>{tb.annahme}</Hinweismarke>}
                                  </>
                                }
                                herleitung={{
                                  berechnung:
                                    e.zinsHerkunft?.art === "variabel"
                                      ? fuelle(tb.herleitung.zinsVariabel, { referenz: e.zinsHerkunft.referenz, stichtag: f.datum(e.zinsHerkunft.stichtag), satz: f.prozent(e.zinsHerkunft.satz), marge: f.prozent(e.zinsHerkunft.marge) })
                                      : tb.herleitung.zinsFest,
                                  quelle: fuelle(tb.herleitung.quelle, { datum: a.angebotVom ? f.datum(a.angebotVom) : "–" }),
                                }}
                                t={t}
                                ausrichtung="rechts"
                              />
                            ),
                        ],
                        [tb.zeilen.zinsbindung, (a) => (a.zinsbindungMonate ? fuelle(tb.monateWert, { monate: a.zinsbindungMonate, jahre: f.zahl(String(a.zinsbindungMonate / 12), a.zinsbindungMonate % 12 ? 1 : 0) }) : "–")],
                        [tb.zeilen.tilgung, (a) => (a.tilgungProzent ? f.prozent(a.tilgungProzent) : a.tilgungsart === "ENDFAELLIG" ? t.tilgungsarten.ENDFAELLIG : <Unbekannt t={t} />)],
                        [tb.zeilen.rate, (a, e) => betrag(e.rate, { berechnung: tb.herleitung.rate, werte: [[t.bankangebote.felder.zahlweise, t.zahlweisen[a.zahlweise]]] }, e)],
                        [tb.zeilen.zinsen, (_a, e) => betrag(e.zinsen, { berechnung: fuelle(tb.herleitung.zinsen, { perioden: e.perioden }), fehlt: e.luecken.includes("zinsbindungKuerzer") ? [tb.luecken.zinsbindungKuerzer] : undefined }, e)],
                        [tb.zeilen.tilgungSumme, (_a, e) => (e.tilgung === null ? <Unbekannt t={t} /> : f.betragGanz(e.tilgung))],
                        [tb.zeilen.restschuld, (_a, e) => betrag(e.restschuld, { berechnung: tb.herleitung.restschuld }, e)],
                        [
                          <>
                            {tb.zeilen.gebuehren} (<Begriff k="Disagio" t={t} />)
                          </>,
                          (a, e) =>
                            betrag(
                              e.gebuehren,
                              {
                                berechnung: tb.herleitung.gebuehren,
                                werte: [
                                  [tb.felder.bearbeitungsgebuehr, a.bearbeitungsgebuehr ? f.betrag(a.bearbeitungsgebuehr) : t.allgemein.unbekannt],
                                  [tb.felder.sonstigeKosten, a.sonstigeKosten ? f.betrag(a.sonstigeKosten) : "–"],
                                  [t.glossar.Disagio.kurz, e.disagio ? f.betrag(e.disagio) : t.allgemein.unbekannt],
                                ],
                              },
                              e,
                            ),
                        ],
                        [<strong key="g">{tb.zeilen.gesamtkosten}</strong>, (_a, e) => <strong>{betrag(e.gesamtkosten, { berechnung: tb.herleitung.gesamtkosten, fehlt: e.luecken.map((l) => tb.luecken[l]) }, e)}</strong>],
                        [
                          <Begriff key="e" k="Effektivzins" t={t}>
                            {tb.zeilen.effektivzins}
                          </Begriff>,
                          (_a, e) =>
                            e.effektivzins === null ? (
                              <Unbekannt t={t} grund={e.luecken.map((l) => tb.luecken[l]).join(" · ")} />
                            ) : (
                              <MitHerleitung wert={f.prozent(e.effektivzins, 2)} herleitung={{ berechnung: tb.herleitung.effektivzins }} t={t} ausrichtung="rechts" />
                            ),
                        ],
                        [tb.zeilen.sondertilgung, (a) => (a.sondertilgungProzent ? fuelle(tb.sondertilgungWert, { wert: f.prozent(a.sondertilgungProzent) }) : "–")],
                        [
                          <Begriff key="b" k="Bereitstellungszins" t={t}>
                            {tb.zeilen.bereitstellung}
                          </Begriff>,
                          (a) =>
                            a.bereitstellungszins
                              ? [fuelle(tb.prozentMonat, { wert: f.prozent(a.bereitstellungszins, 3) }), a.bereitstellungsfreiMonate ? fuelle(tb.freiMonate, { monate: a.bereitstellungsfreiMonate }) : null].filter(Boolean).join(", ")
                              : "–",
                        ],
                        [<Begriff key="c" k="Covenant" t={t}>{tb.zeilen.covenants}</Begriff>, (a) => <span className="whitespace-pre-line text-xs">{a.covenants ?? "–"}</span>],
                        [tb.zeilen.sicherheiten, (a) => <span className="whitespace-pre-line text-xs">{a.sicherheiten ?? "–"}</span>],
                        [tb.zeilen.gueltig, (a) => (a.gueltigBis ? f.datum(a.gueltigBis) : "–")],
                      ] as Array<[React.ReactNode, (a: (typeof auswahl)[number], e: AngebotErgebnis) => React.ReactNode]>
                    ).map(([titel, wert], i) => (
                      <tr key={i}>
                        <td className="py-2 pr-4 text-slate-700">{titel}</td>
                        {auswahl.map((a, j) => (
                          <td key={a.id} className="py-2 pr-4 text-right tabular-nums">
                            {wert(a, ergebnisse[j])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {ergebnisse.some((e) => e.gesamtkosten !== null) && (
                <div className="mt-6 max-w-xl">
                  <h3 className="mb-2 text-sm font-semibold text-slate-800">{fuelle(tb.diagrammTitel, { jahre })}</h3>
                  <Balkendiagramm
                    balken={auswahl.flatMap((a, j) => (ergebnisse[j].gesamtkosten ? [{ name: a.bezeichnung ? `${a.bank} – ${a.bezeichnung}` : a.bank, wert: ergebnisse[j].gesamtkosten! }] : []))}
                    format={(w) => f.betragGanz(w)}
                  />
                  {ergebnisse.some((e) => e.gesamtkosten === null) && (
                    <p className="mt-2 text-xs text-amber-800">
                      <Hinweismarke>{tb.unvollstaendig}</Hinweismarke>{" "}
                      {auswahl.filter((_, j) => ergebnisse[j].gesamtkosten === null).map((a) => a.bank).join(", ")}
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </Karte>
      )}

      {entwuerfe.length > 0 && (
        <Karte titel={tb.entwuerfe}>
          <Tabelle>
            {kopf}
            <tbody>{entwuerfe.map(zeile)}</tbody>
          </Tabelle>
        </Karte>
      )}

      <Glossar begriffe={["TermSheet", "Zinsbindung", "Effektivzins", "Disagio", "Marge", "Bereitstellungszins", "Covenant"]} t={t} />
    </div>
  );
}
