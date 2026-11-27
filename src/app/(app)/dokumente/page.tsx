import Link from "next/link";
import { BEZUG_PFAD, DokumentStatusMarke } from "@/components/dokumente";
import { Formular } from "@/components/formular";
import { Kachel, Kacheln, Karte, KnopfLink, Leer, Seitenkopf, Tabelle } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { ladeCheckliste } from "@/lib/daten/dokumente";
import { STATUS_REIHENFOLGE, VORWARNUNG_TAGE, type Bezug } from "@/lib/dokumente";
import { formatierer } from "@/lib/format";
import { standardVorgabenAnlegen } from "./aktionen";

export default async function DokumenteSeite() {
  const kontext = await pruefeZugriff("dokumente");
  const t = texte(kontext.mandant.sprache);
  const f = formatierer(kontext.mandant);
  const td = t.dokumente;
  const schreiben = darf(kontext.rolle, "dokumente", "schreiben");
  const { vorgaben, zeilen, zaehlung, stichtag } = await ladeCheckliste(kontext, undefined, { bereich: true });

  return (
    <div className="space-y-6">
      <Seitenkopf
        titel={td.titel}
        beschreibung={td.beschreibung}
        aktionen={schreiben && <KnopfLink href="/dokumente/vorgaben">{td.vorgaben}</KnopfLink>}
      />
      <p className="text-xs text-slate-500">{td.dateienHinweis}</p>

      {vorgaben.length === 0 ? (
        <Karte>
          <Leer>{td.keineVorgaben}</Leer>
          {schreiben && (
            <div className="mt-4">
              <Formular aktion={standardVorgabenAnlegen} absenden={td.standardUebernehmen} />
            </div>
          )}
        </Karte>
      ) : (
        <>
          <Kacheln>
            <Kachel titel={td.offenGesamt} wert={zaehlung.offen} unter={`${td.offenErklaerung} · ${t.allgemein.stichtag} ${f.datum(stichtag)}`} ton={zaehlung.offen > 0 ? "schlecht" : "gut"} />
            <Kachel titel={td.statusArten.fehlt} wert={zaehlung.fehlt} ton={zaehlung.fehlt > 0 ? "schlecht" : "neutral"} />
            <Kachel titel={td.statusArten.veraltet} wert={zaehlung.veraltet} ton={zaehlung.veraltet > 0 ? "schlecht" : "neutral"} />
            <Kachel titel={td.statusArten.datumFehlt} wert={zaehlung.datumFehlt} ton={zaehlung.datumFehlt > 0 ? "warnung" : "neutral"} />
            <Kachel titel={td.statusArten.laeuftAb} wert={zaehlung.laeuftAb} ton={zaehlung.laeuftAb > 0 ? "warnung" : "neutral"} />
            <Kachel titel={td.statusArten.vorhanden} wert={zaehlung.vorhanden} ton="gut" />
          </Kacheln>

          {(["GESELLSCHAFT", "HAUS", "KREDIT"] as Bezug[]).map((bezug) => {
            const spalten = vorgaben.filter((v) => v.bezug === bezug);
            const reihen = zeilen.filter((z) => z.objekt.bezug === bezug);
            if (spalten.length === 0 || reihen.length === 0) return null;
            return (
              <Karte key={bezug} titel={td.bezuege[bezug]}>
                <Tabelle>
                  <thead>
                    <tr>
                      <th>{td.objekt}</th>
                      {spalten.map((v) => (
                        <th key={v.id} title={v.beschreibung ?? undefined} className="normal-case">
                          {v.name}
                        </th>
                      ))}
                      <th className="text-right">{td.offen}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reihen.map((z) => (
                      <tr key={z.objekt.id}>
                        <td>
                          <Link href={`/dokumente/${BEZUG_PFAD[bezug]}/${z.objekt.id}`} className="font-medium hover:underline">
                            {z.objekt.name}
                          </Link>
                          {z.objekt.unter && <div className="text-xs text-slate-500">{z.objekt.unter}</div>}
                        </td>
                        {z.zellen.map((c) => (
                          <td key={c.vorgabe.id}>
                            <DokumentStatusMarke
                              status={c.bewertung.status}
                              t={t}
                              titel={[
                                fuelle(td.statusErklaerung[c.bewertung.status], { tage: VORWARNUNG_TAGE }),
                                c.bewertung.datum ? `${td.stand}: ${f.datum(c.bewertung.datum)}` : null,
                                c.bewertung.gueltigBis ? `${td.gueltigBis}: ${f.datum(c.bewertung.gueltigBis)}` : null,
                                c.bewertung.herkunft === "automatik" && c.bewertung.automatik ? c.bewertung.automatik.beschreibung : null,
                              ]
                                .filter(Boolean)
                                .join("\n")}
                            />
                          </td>
                        ))}
                        <td className={`text-right font-semibold ${z.zaehlung.offen > 0 ? "text-red-700" : "text-emerald-700"}`}>{z.zaehlung.offen}</td>
                      </tr>
                    ))}
                  </tbody>
                </Tabelle>
              </Karte>
            );
          })}

          <Karte titel={td.status}>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              {STATUS_REIHENFOLGE.map((s) => (
                <div key={s} className="flex items-start gap-2">
                  <dt className="shrink-0">
                    <DokumentStatusMarke status={s} t={t} />
                  </dt>
                  <dd className="text-slate-600">{fuelle(td.statusErklaerung[s], { tage: VORWARNUNG_TAGE })}</dd>
                </div>
              ))}
            </dl>
          </Karte>
        </>
      )}
    </div>
  );
}
