import Link from "next/link";
import { Balkendiagramm } from "@/components/diagramme";
import { Begriff, Glossar, MitHerleitung, Unbekannt } from "@/components/herleitung";
import { Kachel, Kacheln, Karte, Leer, Marke, Seitenkopf, Tabelle, rechts } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { ladeEnergie } from "@/lib/daten/energie";
import { jahresSumme, klassenVerteilung, verlauf, type AusweisStatus } from "@/lib/energie";
import { formatierer } from "@/lib/format";
import { dezimal } from "@/lib/geld";
import { STATUS_TON } from "./ton";

export default async function EnergieSeite() {
  const kontext = await pruefeZugriff("haeuser");
  const t = texte(kontext.mandant.sprache);
  const te = t.energie;
  const f = formatierer(kontext.mandant);
  const { stichtag, haeuser } = await ladeEnergie(kontext);
  const vorjahr = Number(stichtag.slice(0, 4)) - 1;
  const anzahl = (s: AusweisStatus) => haeuser.filter((h) => h.status === s).length;
  const co2 = jahresSumme(haeuser, vorjahr, "WAERME", "co2Kg");
  const klassen = klassenVerteilung(haeuser.map((h) => h.massgeblich?.energieklasse ?? null)).filter((k) => k.anzahl > 0 || k.klasse !== "unbekannt");

  return (
    <div className="max-w-6xl space-y-6">
      <Seitenkopf titel={t.navigation.energie} beschreibung={t.seiten.energie} />
      <Kacheln>
        <Kachel titel={te.kacheln.haeuser} wert={haeuser.length} />
        <Kachel titel={te.kacheln.ohneAusweis} wert={anzahl("fehlt")} ton={anzahl("fehlt") > 0 ? "schlecht" : undefined} />
        <Kachel titel={te.kacheln.abgelaufen} wert={anzahl("abgelaufen")} ton={anzahl("abgelaufen") > 0 ? "schlecht" : undefined} unter={anzahl("laeuftAb") > 0 ? `${anzahl("laeuftAb")} ${te.stati.laeuftAb}` : undefined} />
        <Kachel
          titel={<Begriff k="CO2" t={t}>{fuelle(te.kacheln.co2, { jahr: vorjahr })}</Begriff>}
          wert={co2.bekannt === 0 ? <Unbekannt t={t} /> : `${f.zahl(co2.summe.dividedBy(1000), 1)} t`}
          unter={co2.bekannt > 0 && co2.fehlend > 0 ? fuelle(te.co2Unvollstaendig, { bekannt: co2.bekannt, gesamt: haeuser.length }) : undefined}
          ton={co2.bekannt > 0 && co2.fehlend > 0 ? "warnung" : undefined}
        />
      </Kacheln>

      <Karte titel={te.liste}>
        {haeuser.length === 0 ? (
          <Leer>{te.keineHaeuser}</Leer>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{te.spalten.haus}</th>
                <th>
                  <Begriff k="Energieklasse" t={t}>{te.spalten.klasse}</Begriff>
                </th>
                <th className={rechts}>
                  <Begriff k="Endenergie" t={t}>{te.spalten.endenergie}</Begriff>
                </th>
                <th>{te.spalten.gueltigBis}</th>
                <th className={rechts}>{fuelle(te.spalten.waerme, { jahr: vorjahr })}</th>
                <th className={rechts}>{te.spalten.jeQm}</th>
                <th className={rechts}>{fuelle(te.spalten.co2, { jahr: vorjahr })}</th>
              </tr>
            </thead>
            <tbody>
              {haeuser.map((h) => {
                const a = h.massgeblich;
                const w = verlauf(h.verbraeuche, "WAERME", h.flaeche).find((v) => v.jahr === vorjahr);
                return (
                  <tr key={h.id} data-haus={h.bezeichnung}>
                    <td>
                      <Link href={`/energie/${h.id}`} className="font-medium hover:underline">
                        {h.bezeichnung}
                      </Link>
                      <div className="text-xs text-slate-500">{h.gesellschaft}</div>
                    </td>
                    <td>
                      {a?.energieklasse ? <span className="font-semibold">{a.energieklasse}</span> : <Unbekannt t={t} />}
                      {a && <div className="text-xs text-slate-500">{te.arten[a.art]}</div>}
                    </td>
                    <td className={rechts}>{a?.endenergie ? `${f.zahl(a.endenergie, 1)} ${te.kennwertEinheit}` : <Unbekannt t={t} />}</td>
                    <td className="whitespace-nowrap">
                      {a?.gueltigBis ? f.datum(a.gueltigBis) : "–"} <Marke ton={STATUS_TON[h.status]}>{te.stati[h.status]}</Marke>
                    </td>
                    <td className={rechts}>
                      {w ? (
                        <MitHerleitung wert={`${f.zahl(w.menge, 0)} ${te.einheiten.WAERME}`} herleitung={{ quelle: w.quelle, stichtag: `${vorjahr}` }} t={t} ausrichtung="rechts" />
                      ) : (
                        <Unbekannt t={t} />
                      )}
                    </td>
                    <td className={rechts}>
                      {w?.jeQm ? (
                        <MitHerleitung
                          wert={`${f.zahl(w.jeQm, 1)} ${te.einheiten.WAERME}/m²`}
                          herleitung={{ berechnung: te.jeQmHerleitung, werte: [[te.spalten.menge, `${f.zahl(w.menge, 0)} ${te.einheiten.WAERME}`], [te.flaeche, `${f.zahl(h.flaeche.summe, 0)} m²`]], quelle: w.quelle }}
                          t={t}
                          ausrichtung="rechts"
                        />
                      ) : (
                        "–"
                      )}
                    </td>
                    <td className={rechts}>{w?.co2Kg ? `${f.zahl(w.co2Kg.dividedBy(1000), 1)} t` : <Unbekannt t={t} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </Tabelle>
        )}
      </Karte>

      <Karte titel={te.klassenDiagramm}>
        <Balkendiagramm
          balken={klassen.map((k) => ({ name: k.klasse === "unbekannt" ? te.unbekannteKlasse : k.klasse, wert: dezimal(k.anzahl), farbe: k.klasse === "unbekannt" ? "#94a3b8" : undefined }))}
          format={(w) => f.zahl(w, 0)}
        />
      </Karte>
      <p className="text-xs text-slate-500">{te.hinweisKlasse}</p>
      <Glossar begriffe={["Energieklasse", "Endenergie", "Bedarfsausweis", "CO2"]} t={t} />
    </div>
  );
}
