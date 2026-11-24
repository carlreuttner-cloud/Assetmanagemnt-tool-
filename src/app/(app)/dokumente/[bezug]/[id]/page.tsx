import Link from "next/link";
import { notFound } from "next/navigation";
import { DokumentStatusMarke } from "@/components/dokumente";
import { Formular } from "@/components/formular";
import { Auswahl, Feld, Felder, Karte, Leer, Seitenkopf } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { ladeCheckliste } from "@/lib/daten/dokumente";
import type { Bezug } from "@/lib/dokumente";
import { formatierer } from "@/lib/format";
import { nachweisLoeschen, nachweisSpeichern } from "../../aktionen";

const AUS_PFAD: Record<string, Bezug> = { gesellschaft: "GESELLSCHAFT", haus: "HAUS", kredit: "KREDIT" };

export default async function ObjektChecklisteSeite({ params }: PageProps<"/dokumente/[bezug]/[id]">) {
  const { bezug: pfad, id } = await params;
  const bezug = AUS_PFAD[pfad];
  if (!bezug) notFound();
  const kontext = await pruefeZugriff("dokumente");
  const t = texte(kontext.mandant.sprache);
  const f = formatierer(kontext.mandant);
  const td = t.dokumente;
  const schreiben = darf(kontext.rolle, "dokumente", "schreiben");
  const { zeilen, stichtag } = await ladeCheckliste(kontext, { bezug, id });
  const zeile = zeilen[0];
  if (!zeile) notFound();
  const { objekt, zellen, zaehlung } = zeile;

  return (
    <div className="max-w-5xl space-y-6">
      <Seitenkopf
        titel={`${td.checkliste}: ${objekt.name}`}
        beschreibung={
          <>
            {td.bezugEinzeln[bezug]}
            {objekt.unter && ` · ${objekt.unter}`} ·{" "}
            <Link href={objekt.href} className="hover:underline">
              {objekt.name}
            </Link>
          </>
        }
        zurueck={{ href: "/dokumente", text: td.titel }}
      />
      <p className="text-sm text-slate-600">
        <span className="font-semibold">
          {zaehlung.offen} {td.offen}
        </span>{" "}
        ({td.offenErklaerung}) · {t.allgemein.stichtag} {f.datum(stichtag)}
      </p>

      <Karte>
        {zellen.length === 0 ? (
          <Leer>{td.keineVorgaben}</Leer>
        ) : (
          <ul className="divide-y divide-slate-100">
            {zellen.map(({ vorgabe, nachweis, bewertung }) => (
              <li key={vorgabe.id} id={`v-${vorgabe.id}`} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{vorgabe.name}</div>
                    {vorgabe.beschreibung && <div className="text-xs text-slate-500">{vorgabe.beschreibung}</div>}
                  </div>
                  <DokumentStatusMarke status={bewertung.status} t={t} />
                </div>
                <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-600 sm:grid-cols-4">
                  <div>
                    <dt className="text-slate-400">{td.stand}</dt>
                    <dd>{bewertung.datum ? f.datum(bewertung.datum) : "–"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">{td.gueltigBis}</dt>
                    <dd>{vorgabe.gueltigMonate === null ? td.unbegrenzt : bewertung.gueltigBis ? f.datum(bewertung.gueltigBis) : "–"}</dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">{td.herkunft}</dt>
                    <dd>
                      {bewertung.herkunft === "automatik" && bewertung.automatik
                        ? fuelle(td.herkunftAutomatik, { quelle: bewertung.automatik.beschreibung })
                        : nachweis
                          ? td.herkunftNachweis
                          : "–"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-400">{td.ablageort}</dt>
                    <dd>{nachweis?.ablageort ?? "–"}</dd>
                  </div>
                  {nachweis?.notiz && (
                    <div className="col-span-2 sm:col-span-4">
                      <dt className="text-slate-400">{td.notiz}</dt>
                      <dd>{nachweis.notiz}</dd>
                    </div>
                  )}
                </dl>
                {schreiben && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs font-medium text-slate-700">{td.erfassen}</summary>
                    <div className="mt-3 space-y-3">
                      <Formular aktion={nachweisSpeichern.bind(null, { vorgabeId: vorgabe.id, bezug, objektId: id })} absenden={t.allgemein.speichern}>
                        <Felder>
                          <Auswahl
                            name="erfassung"
                            label={td.erfassungStatus}
                            wert={nachweis ? (nachweis.nichtErforderlich ? "nichtErforderlich" : nachweis.vorhanden ? "vorhanden" : "fehlt") : "vorhanden"}
                            optionen={(["vorhanden", "fehlt", "nichtErforderlich"] as const).map((s) => ({ wert: s, text: td.erfassungStati[s] }))}
                            pflicht
                          />
                          <Feld name="dokumentDatum" label={td.stand} typ="date" wert={nachweis?.dokumentDatum} />
                          <Feld name="ablageort" label={td.ablageort} wert={nachweis?.ablageort} platzhalter={td.ablageortHinweis} />
                          <Feld name="notiz" label={td.notiz} wert={nachweis?.notiz} />
                        </Felder>
                      </Formular>
                      {nachweis && (
                        <Formular aktion={nachweisLoeschen.bind(null, nachweis.id, bezug, id)} absenden={td.zuruecksetzen} art="sekundaer" bestaetigen={t.allgemein.loeschenBestaetigen} />
                      )}
                    </div>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </Karte>
      <p className="text-xs text-slate-500">
        {td.automatikHinweis} {td.dateienHinweis}
      </p>
    </div>
  );
}
