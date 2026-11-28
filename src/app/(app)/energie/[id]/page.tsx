import { notFound } from "next/navigation";
import { Jahressaeulen } from "@/components/diagramme";
import { Formular } from "@/components/formular";
import { Begriff, Glossar, MitHerleitung, Unbekannt } from "@/components/herleitung";
import { Angaben, Auswahl, Feld, Felder, Kachel, Kacheln, Karte, KnopfLink, Leer, Marke, Seitenkopf, Tabelle, Textfeld, rechts } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { ladeEnergie } from "@/lib/daten/energie";
import { ENERGIEKLASSEN, MEDIEN, verlauf } from "@/lib/energie";
import { formatierer } from "@/lib/format";
import { ausweisLoeschen, ausweisSpeichern, verbrauchLoeschen, verbrauchSpeichern } from "../aktionen";
import { STATUS_TON } from "../ton";

export default async function EnergieHausSeite({ params }: PageProps<"/energie/[id]">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("haeuser");
  const t = texte(kontext.mandant.sprache);
  const te = t.energie;
  const f = formatierer(kontext.mandant);
  const schreiben = darf(kontext.rolle, "haeuser", "schreiben");
  const { stichtag, haeuser } = await ladeEnergie(kontext, { hausId: id });
  const h = haeuser[0];
  if (!h) notFound();
  const a = h.massgeblich;
  const verlaeufe = MEDIEN.map((m) => ({ medium: m, jahre: verlauf(h.verbraeuche, m, h.flaeche) })).filter((v) => v.jahre.length > 0);
  const letzteWaerme = verlaeufe.find((v) => v.medium === "WAERME")?.jahre.at(-1) ?? null;

  return (
    <div className="max-w-6xl space-y-6">
      <Seitenkopf titel={h.bezeichnung} beschreibung={`${h.gesellschaft} · ${t.navigation.energie}`} zurueck={{ href: "/energie", text: te.zurUebersicht }} aktionen={<KnopfLink href={`/haeuser/${h.id}`}>{te.zumHaus}</KnopfLink>} />
      <Kacheln>
        <Kachel titel={<Begriff k="Energieklasse" t={t}>{te.energieklasse}</Begriff>} wert={a?.energieklasse ?? <Unbekannt t={t} />} unter={a ? te.arten[a.art] : undefined} />
        <Kachel titel={<Begriff k="Endenergie" t={t}>{te.spalten.endenergie}</Begriff>} wert={a?.endenergie ? f.zahl(a.endenergie, 1) : <Unbekannt t={t} />} unter={a?.endenergie ? te.kennwertEinheit : undefined} />
        <Kachel titel={te.gueltigBis} wert={a?.gueltigBis ? f.datum(a.gueltigBis) : <Unbekannt t={t} />} unter={<Marke ton={STATUS_TON[h.status]}>{te.stati[h.status]}</Marke>} ton={h.status === "abgelaufen" || h.status === "fehlt" ? "schlecht" : h.status === "laeuftAb" ? "warnung" : undefined} />
        <Kachel
          titel={letzteWaerme ? `${te.medien.WAERME} ${letzteWaerme.jahr}` : te.medien.WAERME}
          wert={letzteWaerme ? `${f.zahl(letzteWaerme.menge, 0)} ${te.einheiten.WAERME}` : <Unbekannt t={t} />}
          unter={letzteWaerme?.jeQm ? `${f.zahl(letzteWaerme.jeQm, 1)} ${te.einheiten.WAERME}/m²` : undefined}
        />
      </Kacheln>

      <Karte titel={te.ausweise}>
        {h.ausweise.length === 0 ? (
          <Leer>{te.keineAusweise}</Leer>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{te.spalten.art}</th>
                <th>{te.spalten.klasse}</th>
                <th className={rechts}>{te.spalten.endenergie}</th>
                <th className={rechts}>{te.primaerenergie}</th>
                <th>{te.spalten.ausgestellt}</th>
                <th>{te.spalten.gueltigBis}</th>
                <th>{te.spalten.quelle}</th>
                {schreiben && <th />}
              </tr>
            </thead>
            <tbody>
              {h.ausweise.map((x) => (
                <tr key={x.id} data-ausweis={x.id}>
                  <td>
                    {te.arten[x.art]} {x.id === a?.id && <Marke ton="neutral">{te.massgeblich}</Marke>}
                    {x.energietraeger && <div className="text-xs text-slate-500">{x.energietraeger}</div>}
                  </td>
                  <td className="font-semibold">{x.energieklasse ?? <Unbekannt t={t} />}</td>
                  <td className={rechts}>{x.endenergie ? f.zahl(x.endenergie, 1) : "–"}</td>
                  <td className={rechts}>{x.primaerenergie ? f.zahl(x.primaerenergie, 1) : "–"}</td>
                  <td>{x.ausgestelltAm ? f.datum(x.ausgestelltAm) : "–"}</td>
                  <td>{x.gueltigBis ? f.datum(x.gueltigBis) : "–"}</td>
                  <td className="text-sm">
                    {x.quelle ?? "–"}
                    {x.registriernummer && <div className="text-xs text-slate-500">{x.registriernummer}</div>}
                  </td>
                  {schreiben && (
                    <td className={rechts}>
                      <Formular aktion={ausweisLoeschen.bind(null, h.id, x.id)} absenden={t.allgemein.loeschen} art="gefahr" bestaetigen={t.allgemein.loeschenBestaetigen} inline />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </Tabelle>
        )}
        {schreiben && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-sky-700">{te.ausweisNeu}</summary>
            <Formular aktion={ausweisSpeichern.bind(null, h.id)} absenden={t.allgemein.speichern} className="mt-3" zuruecksetzen>
              <Felder>
                <Auswahl name="art" label={te.art} optionen={(["VERBRAUCH", "BEDARF"] as const).map((x) => ({ wert: x, text: te.arten[x] }))} pflicht />
                <Auswahl name="energieklasse" label={te.energieklasse} optionen={ENERGIEKLASSEN.map((k) => ({ wert: k, text: k }))} leerText={te.unbekannteKlasse} />
                <Feld name="endenergie" label={te.endenergie} inputMode="decimal" />
                <Feld name="primaerenergie" label={te.primaerenergie} inputMode="decimal" />
                <Feld name="energietraeger" label={te.energietraeger} />
                <Feld name="registriernummer" label={te.registriernummer} />
                <Feld name="ausgestelltAm" label={te.ausgestelltAm} typ="date" />
                <Feld name="gueltigBis" label={te.gueltigBis} typ="date" />
                <Feld name="quelle" label={te.quelle} platzhalter={te.quelleAusweis} />
                <Textfeld name="notiz" label={t.allgemein.notiz} />
              </Felder>
            </Formular>
          </details>
        )}
      </Karte>

      <Karte titel={te.verbraeuche}>
        {verlaeufe.length === 0 ? (
          <Leer>{te.keineVerbraeuche}</Leer>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{te.spalten.jahr}</th>
                <th>{te.spalten.medium}</th>
                <th className={rechts}>{te.spalten.menge}</th>
                <th className={rechts}>{te.spalten.jeQm}</th>
                <th className={rechts}>{te.spalten.vorjahr}</th>
                <th className={rechts}>{te.spalten.kosten}</th>
                <th className={rechts}>
                  <Begriff k="CO2" t={t}>{te.co2}</Begriff>
                </th>
                <th>{te.spalten.quelle}</th>
                {schreiben && <th />}
              </tr>
            </thead>
            <tbody>
              {verlaeufe.flatMap((v) =>
                [...v.jahre].reverse().map((j) => {
                  const roh = h.verbraeuche.find((x) => x.jahr === j.jahr && x.medium === v.medium)!;
                  return (
                    <tr key={`${v.medium}-${j.jahr}`} data-verbrauch={`${v.medium}-${j.jahr}`}>
                      <td>{j.jahr}</td>
                      <td>
                        {te.medien[v.medium]}
                        {roh.energietraeger && <div className="text-xs text-slate-500">{roh.energietraeger}</div>}
                      </td>
                      <td className={rechts}>
                        {f.zahl(j.menge, 0)} {te.einheiten[v.medium]}
                      </td>
                      <td className={rechts}>
                        {j.jeQm ? (
                          <MitHerleitung
                            wert={f.zahl(j.jeQm, 2)}
                            herleitung={{ berechnung: te.jeQmHerleitung, werte: [[te.spalten.menge, `${f.zahl(j.menge, 0)} ${te.einheiten[v.medium]}`], [te.flaeche, `${f.zahl(h.flaeche.summe, 0)} m²`]], quelle: j.quelle, stichtag: String(j.jahr) }}
                            t={t}
                            ausrichtung="rechts"
                          />
                        ) : (
                          "–"
                        )}
                      </td>
                      <td className={rechts}>
                        {j.vorjahr ? <MitHerleitung wert={f.prozent(j.vorjahr, 1)} herleitung={{ berechnung: te.vorjahrHerleitung }} t={t} ausrichtung="rechts" /> : "–"}
                      </td>
                      <td className={rechts}>{j.kosten ? f.betragGanz(j.kosten) : "–"}</td>
                      <td className={rechts}>{j.co2Kg ? f.zahl(j.co2Kg, 0) : <Unbekannt t={t} />}</td>
                      <td className="text-sm">{j.quelle}</td>
                      {schreiben && (
                        <td className={rechts}>
                          <Formular aktion={verbrauchLoeschen.bind(null, h.id, roh.id)} absenden={t.allgemein.loeschen} art="gefahr" bestaetigen={t.allgemein.loeschenBestaetigen} inline />
                        </td>
                      )}
                    </tr>
                  );
                }),
              )}
            </tbody>
          </Tabelle>
        )}
        {schreiben && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-sky-700">{te.verbrauchNeu}</summary>
            <p className="mt-2 text-xs text-slate-500">{te.verbrauchHinweis}</p>
            <Formular aktion={verbrauchSpeichern.bind(null, h.id)} absenden={t.allgemein.speichern} className="mt-3" zuruecksetzen>
              <Felder>
                <Feld name="jahr" label={te.jahr} wert={String(Number(stichtag.slice(0, 4)) - 1)} inputMode="numeric" pflicht />
                <Auswahl name="medium" label={te.medium} optionen={MEDIEN.map((m) => ({ wert: m, text: `${te.medien[m]} (${te.einheiten[m]})` }))} pflicht />
                <Feld name="menge" label={te.menge} inputMode="decimal" pflicht />
                <Feld name="kosten" label={te.kosten} inputMode="decimal" />
                <Feld name="co2Kg" label={te.co2} inputMode="decimal" />
                <Feld name="energietraeger" label={te.energietraeger} />
                <Feld name="quelle" label={te.quelle} platzhalter={te.quelleVerbrauch} pflicht />
                <Textfeld name="notiz" label={t.allgemein.notiz} />
              </Felder>
            </Formular>
          </details>
        )}
      </Karte>

      {verlaeufe.map((v) => (
        <Karte key={v.medium} titel={fuelle(te.verbrauchDiagramm, { medium: te.medien[v.medium], einheit: te.einheiten[v.medium] })}>
          <Jahressaeulen jahre={v.jahre.map((j) => ({ jahr: j.jahr, wert: j.menge, titel: j.quelle }))} format={(w) => `${f.zahl(w, 0)} ${te.einheiten[v.medium]}`} formatKurz={(w) => f.zahl(w, 0)} legende={{ beleg: te.medien[v.medium], entwurf: "", plan: "" }} />
        </Karte>
      ))}
      <Karte>
        <Angaben eintraege={[[te.flaeche, `${f.zahl(h.flaeche.summe, 0)} m²`]]} />
        <p className="mt-2 text-xs text-slate-500">{te.hinweisKlasse}</p>
      </Karte>
      <Glossar begriffe={["Energieklasse", "Endenergie", "Bedarfsausweis", "CO2"]} t={t} />
    </div>
  );
}
