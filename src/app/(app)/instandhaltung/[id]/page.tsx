import { notFound } from "next/navigation";
import { Fragment } from "react";
import { Jahressaeulen } from "@/components/diagramme";
import { Formular } from "@/components/formular";
import { Begriff, Glossar, MitHerleitung, Unbekannt } from "@/components/herleitung";
import { Auswahl, Feld, Felder, Kachel, Kacheln, Karte, KnopfLink, Leer, Marke, Seitenkopf, Tabelle, Textfeld, rechts } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { formatMonat, heute, plusMonate } from "@/lib/datum";
import { ladeInstandhaltung, type InstandhaltungBauteil } from "@/lib/daten/instandhaltung";
import { formatierer } from "@/lib/format";
import { BAUTEIL_ARTEN, faelligBis, kostenJeJahr, planjahr, VORSCHAU_JAHRE } from "@/lib/instandhaltung";
import { bauteilLoeschen, bauteilSpeichern, inLiquiditaetUebernehmen } from "../aktionen";
import { STATUS_TON } from "../ton";

export default async function InstandhaltungHausSeite({ params }: PageProps<"/instandhaltung/[id]">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("haeuser");
  const t = texte(kontext.mandant.sprache);
  const ti = t.instandhaltung;
  const f = formatierer(kontext.mandant);
  const schreiben = darf(kontext.rolle, "haeuser", "schreiben");
  const planen = schreiben && darf(kontext.rolle, "gesellschaften", "schreiben");
  const { jahr, haeuser } = await ladeInstandhaltung(kontext, { hausId: id });
  const h = haeuser[0];
  if (!h) notFound();
  const naechsterMonat = `${plusMonate(heute(), 1).slice(0, 7)}-01`;
  const vorschlag = (b: InstandhaltungBauteil) => {
    const p = planjahr(b, jahr);
    return p === null || p <= jahr ? naechsterMonat : `${p}-01-01`;
  };
  const bald = faelligBis(h.bauteile, jahr, jahr + VORSCHAU_JAHRE);
  const jahre = kostenJeJahr(h.bauteile, jahr);

  const formularFelder = (b?: InstandhaltungBauteil) => (
    <Felder>
      {b && <input type="hidden" name="id" value={b.id} />}
      <Auswahl name="art" label={ti.art} optionen={BAUTEIL_ARTEN.map((a) => ({ wert: a, text: ti.arten[a] }))} wert={b?.art} pflicht />
      <Feld name="bezeichnung" label={ti.bezeichnung} wert={b?.bezeichnung} pflicht />
      <Feld name="zyklusJahre" label={ti.zyklus} wert={b?.zyklusJahre?.toString()} inputMode="numeric" />
      <Feld name="letzteErneuerung" label={ti.letzteErneuerung} wert={b?.letzteErneuerung?.toString()} inputMode="numeric" hinweis={ti.letzteHinweis} />
      <Feld name="geplanteKosten" label={ti.geplanteKosten} wert={b?.geplanteKosten ? f.eingabe(b.geplanteKosten) : undefined} inputMode="decimal" />
      <Feld name="kostenQuelle" label={ti.kostenQuelle} wert={b?.kostenQuelle ?? undefined} platzhalter={ti.kostenQuellePlatzhalter} />
      <Feld name="kostenStand" label={ti.kostenStand} wert={b?.kostenStand ?? undefined} typ="date" />
      <Textfeld name="notiz" label={t.allgemein.notiz} wert={b?.notiz ?? undefined} />
    </Felder>
  );

  return (
    <div className="max-w-6xl space-y-6">
      <Seitenkopf
        titel={h.bezeichnung}
        beschreibung={`${h.gesellschaft} · ${t.navigation.instandhaltung}`}
        zurueck={{ href: "/instandhaltung", text: ti.zurUebersicht }}
        aktionen={
          <>
            <KnopfLink href={`/haeuser/${h.id}`}>{ti.zumHaus}</KnopfLink>
            <KnopfLink href={`/liquiditaet?g=${h.gesellschaftId}`}>{ti.zurLiquiditaet}</KnopfLink>
          </>
        }
      />
      <Kacheln>
        <Kachel titel={ti.kacheln.bauteile} wert={h.bauteile.length} />
        <Kachel titel={ti.kacheln.ueberfaellig} wert={h.bauteile.filter((b) => b.status === "ueberfaellig").length} ton={h.bauteile.some((b) => b.status === "ueberfaellig") ? "schlecht" : undefined} />
        <Kachel
          titel={fuelle(ti.kacheln.bald, { jahr: jahr + VORSCHAU_JAHRE })}
          wert={bald.anzahl === 0 ? 0 : f.betragGanz(bald.summe)}
          unter={bald.ohneKosten > 0 ? fuelle(ti.kostenUnvollstaendig, { anzahl: bald.ohneKosten }) : undefined}
          ton={bald.ohneKosten > 0 ? "warnung" : undefined}
        />
        <Kachel titel={ti.kacheln.unbekannt} wert={h.bauteile.filter((b) => b.status === "unbekannt").length} />
      </Kacheln>

      <Karte titel={ti.bauteile}>
        {h.bauteile.length === 0 ? (
          <Leer>{ti.keineBauteile}</Leer>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{ti.spalten.bauteil}</th>
                <th className={rechts}>
                  <Begriff k="Erneuerungszyklus" t={t}>{ti.spalten.zyklus}</Begriff>
                </th>
                <th className={rechts}>{ti.spalten.letzte}</th>
                <th>{ti.spalten.naechste}</th>
                <th className={rechts}>{ti.spalten.kosten}</th>
                <th>{ti.spalten.liquiditaet}</th>
                {schreiben && <th />}
              </tr>
            </thead>
            <tbody>
              {h.bauteile.map((b) => (
                <Fragment key={b.id}>
                <tr data-bauteil={b.bezeichnung} className="align-top">
                  <td>
                    <span className="font-medium">{b.bezeichnung}</span>
                    <div className="text-xs text-slate-500">{ti.arten[b.art]}</div>
                    {b.notiz && <div className="text-xs text-slate-500">{b.notiz}</div>}
                  </td>
                  <td className={rechts}>{b.zyklusJahre === null ? <Unbekannt t={t} /> : fuelle(ti.jahre, { anzahl: b.zyklusJahre })}</td>
                  <td className={rechts}>{b.letzteErneuerung ?? <Unbekannt t={t} />}</td>
                  <td className="whitespace-nowrap">
                    {b.naechste === null ? (
                      <MitHerleitung
                        wert={<Unbekannt t={t} />}
                        herleitung={{ berechnung: ti.naechsteHerleitung, fehlt: [b.letzteErneuerung === null ? ti.fehltLetzte : null, b.zyklusJahre === null ? ti.fehltZyklus : null].filter((x): x is string => x !== null) }}
                        t={t}
                      />
                    ) : (
                      <MitHerleitung
                        wert={String(b.naechste)}
                        herleitung={{ berechnung: ti.naechsteHerleitung, werte: [[ti.spalten.letzte, String(b.letzteErneuerung)], [ti.spalten.zyklus, fuelle(ti.jahre, { anzahl: b.zyklusJahre! })]] }}
                        t={t}
                      />
                    )}{" "}
                    <Marke ton={STATUS_TON[b.status]}>{ti.stati[b.status]}</Marke>
                  </td>
                  <td className={rechts}>
                    {b.geplanteKosten === null ? (
                      <Unbekannt t={t} />
                    ) : (
                      <MitHerleitung wert={f.betragGanz(b.geplanteKosten)} herleitung={{ quelle: b.kostenQuelle ?? undefined, stichtag: b.kostenStand ? f.datum(b.kostenStand) : undefined }} t={t} ausrichtung="rechts" />
                    )}
                  </td>
                  <td>
                    {b.positionen.map((p) => (
                      <div key={p.id} className="text-xs">
                        <Marke ton={b.uebernommen ? "gut" : "neutral"}>{fuelle(ti.uebernommenAm, { monat: formatMonat(p.monat) })}</Marke>
                      </div>
                    ))}
                    {planen && !b.uebernommen && b.geplanteKosten !== null && b.naechste !== null && b.status !== "spaeter" && (
                      <Formular aktion={inLiquiditaetUebernehmen.bind(null, h.id, b.id)} absenden={ti.uebernehmen} className="mt-1">
                        <Feld name="monat" label={ti.planMonat} typ="date" wert={vorschlag(b)} pflicht />
                      </Formular>
                    )}
                    {!b.uebernommen && b.positionen.length === 0 && (!planen || b.geplanteKosten === null || b.naechste === null || b.status === "spaeter") && "–"}
                  </td>
                  {schreiben && (
                    <td className={rechts}>
                      <Formular aktion={bauteilLoeschen.bind(null, h.id, b.id)} absenden={t.allgemein.loeschen} art="gefahr" bestaetigen={t.allgemein.loeschenBestaetigen} inline />
                    </td>
                  )}
                </tr>
                {schreiben && (
                  <tr data-bearbeiten={b.bezeichnung}>
                    <td colSpan={7} className="pt-0">
                      <details>
                        <summary className="cursor-pointer text-xs text-sky-700">{ti.bearbeiten}</summary>
                        <Formular aktion={bauteilSpeichern.bind(null, h.id)} absenden={t.allgemein.speichern} className="mt-2">
                          {formularFelder(b)}
                        </Formular>
                      </details>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </Tabelle>
        )}
        {schreiben && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-sky-700">{ti.bauteilNeu}</summary>
            <p className="mt-2 text-xs text-slate-500">{ti.hinweisErneuert}</p>
            <Formular aktion={bauteilSpeichern.bind(null, h.id)} absenden={t.allgemein.speichern} className="mt-3" zuruecksetzen>
              {formularFelder()}
            </Formular>
          </details>
        )}
      </Karte>

      {h.bauteile.length > 0 && (
        <Karte titel={ti.kostenDiagramm}>
          <Jahressaeulen
            jahre={jahre.map((j) => ({ jahr: j.jahr, wert: j.anzahl === 0 ? null : j.summe, entwurf: j.ohneKosten > 0, titel: j.ohneKosten > 0 ? fuelle(ti.jahrUnvollstaendig, { anzahl: j.ohneKosten }) : undefined }))}
            format={(w) => f.betragGanz(w)}
            formatKurz={(w) => f.betragKurz(w)}
            legende={{ beleg: ti.legendeKosten, entwurf: t.allgemein.unvollstaendig, plan: "" }}
          />
          <p className="mt-2 text-xs text-slate-500">{ti.kostenDiagrammHinweis}</p>
        </Karte>
      )}
      <Glossar begriffe={["Erneuerungszyklus"]} t={t} />
    </div>
  );
}
