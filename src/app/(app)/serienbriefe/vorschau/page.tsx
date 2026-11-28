import { Fragment } from "react";
import { Formular } from "@/components/formular";
import { Begriff, Glossar, MitHerleitung } from "@/components/herleitung";
import { Kachel, Kacheln, Karte, KnopfLink, Leer, Marke, MieteZelle, Seitenkopf, Tabelle, rechts } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { heute } from "@/lib/datum";
import { istBereit, ladeEmpfaenger, leseSerie, type Empfaenger } from "@/lib/daten/serienbrief";
import { formatierer } from "@/lib/format";
import { jahresNettokaltmiete } from "@/lib/miete";
import { KAPPUNGSGRENZE_PROZENT } from "@/lib/serienbrief";
import { serieErstellen } from "../aktionen";

const ein = (w: string | string[] | undefined) => (typeof w === "string" ? w : undefined);

export default async function SerienbriefVorschau({ searchParams }: PageProps<"/serienbriefe/vorschau">) {
  const kontext = await pruefeZugriff("mieter");
  const t = texte(kontext.mandant.sprache);
  const ts = t.serienbriefe;
  const f = formatierer(kontext.mandant);
  const sp = await searchParams;
  const anfrage = { vorlage: ein(sp.vorlage), haus: ein(sp.haus), gesellschaft: ein(sp.gesellschaft), prozent: ein(sp.prozent), betrag: ein(sp.betrag), datum: ein(sp.datum) };
  const { fehler, vorlage, parameter } = await leseSerie(kontext, anfrage, heute());
  const kopf = <Seitenkopf titel={ts.vorschau} beschreibung={vorlage ? `${vorlage.name} · ${ts.arten[vorlage.art]}` : undefined} zurueck={{ href: "/serienbriefe", text: ts.zurUebersicht }} />;
  if (fehler || !vorlage || !parameter) {
    return (
      <div className="max-w-6xl space-y-6">
        {kopf}
        <Leer>{ts.fehler[fehler ?? "vorlage"]}</Leer>
      </div>
    );
  }
  const erhoehung = vorlage.art === "MIETERHOEHUNG";
  // Bei Mieterhöhungen nur Wohnraum: Gewerbe- und Stellplatzmieten folgen dem Vertrag.
  const empfaenger = (await ladeEmpfaenger(kontext, parameter, f, ts.fehlt)).filter((e) => !erhoehung || e.ausgeschlossen !== "keinWohnraum");
  const bereit = empfaenger.filter(istBereit);
  const ausgeschlossen = empfaenger.filter((e) => e.ausgeschlossen !== null);
  const luecken = empfaenger.filter((e) => e.ausgeschlossen === null && !istBereit(e));
  const ueberKappung = empfaenger.filter((e) => e.ausgeschlossen === null && e.erhoehung?.ueberKappung).length;
  const darfAblegen = darf(kontext.rolle, "mieter", "schreiben") && darf(kontext.rolle, "dokumente", "schreiben");
  const pdfQuery = new URLSearchParams(Object.entries(anfrage).filter((e): e is [string, string] => !!e[1]));
  const kategorie = erhoehung ? ts.kategorieMieterhoehung : ts.kategorieSchreiben;

  const status = (e: Empfaenger) => {
    if (e.ausgeschlossen === "keinWohnraum") return <Marke ton="neutral">{ts.stati.keinWohnraum}</Marke>;
    if (e.ausgeschlossen === "nochNicht")
      return (
        <>
          <Marke ton="neutral">{ts.stati.nochNicht}</Marke>
          {e.erhoehung && <div className="text-xs text-slate-500">{fuelle(ts.nochNichtAb, { datum: f.datum(e.erhoehung.verlangenAb) })}</div>}
        </>
      );
    if (!istBereit(e))
      return (
        <>
          <Marke ton="warnung">{ts.stati.luecke}</Marke>
          <div className="text-xs text-slate-500">{[e.fehlend.length ? fuelle(ts.fehltWerte, { namen: e.fehlend.join(", ") }) : null, e.anschrift ? null : ts.keineAnschrift].filter(Boolean).join(" · ")}</div>
        </>
      );
    return <Marke ton="gut">{ts.stati.bereit}</Marke>;
  };

  const tabelle = (
    <Tabelle>
      <thead>
        <tr>
          <th />
          <th>{ts.spalten.empfaenger}</th>
          <th>{ts.spalten.einheit}</th>
          <th className={rechts}>
            <Begriff k="JNKM" t={t}>{ts.spalten.miete}</Begriff>
          </th>
          {erhoehung && <th>{ts.spalten.verlangenAb}</th>}
          {erhoehung && <th className={rechts}>{ts.spalten.neueMiete}</th>}
          <th>{ts.spalten.status}</th>
        </tr>
      </thead>
      <tbody>
        {empfaenger.map((e) => (
          <Fragment key={e.mietverhaeltnisId}>
            <tr data-empfaenger={e.mieter} className="align-top">
              <td>{istBereit(e) && <input type="checkbox" name="mv" value={e.mietverhaeltnisId} defaultChecked className="h-4 w-4 rounded border-slate-300" aria-label={e.mieter} />}</td>
              <td className="font-medium">{e.mieter}</td>
              <td>
                {e.einheit}
                <div className="text-xs text-slate-500">{e.haus}</div>
              </td>
              <td className={rechts}>
                <MieteZelle monat={f.betrag(e.miete)} jahr={f.betrag(jahresNettokaltmiete(e.miete))} />
              </td>
              {erhoehung && <td>{e.erhoehung && e.ausgeschlossen !== "keinWohnraum" ? f.datum(e.erhoehung.verlangenAb) : "–"}</td>}
              {erhoehung && (
                <td className={rechts}>
                  {e.erhoehung && e.ausgeschlossen === null ? (
                    <MitHerleitung
                      wert={<MieteZelle monat={f.betrag(e.erhoehung.neueMiete)} jahr={f.betrag(jahresNettokaltmiete(e.erhoehung.neueMiete))} />}
                      herleitung={{
                        berechnung: parameter.prozent ? ts.neueMieteHerleitung : ts.neueMieteHerleitungBetrag,
                        werte: [
                          [ts.spalten.miete, f.betrag(e.miete)],
                          [ts.platzhalter.erhoehungProzent, e.erhoehung.prozent === null ? t.allgemein.unbekannt : f.prozent(e.erhoehung.prozent, 2)],
                          [ts.platzhalter.erhoehungBetrag, f.betrag(e.erhoehung.betrag)],
                        ],
                        stichtag: f.datum(parameter.datum),
                        hinweis: e.erhoehung.ueberKappung ? fuelle(ts.kappung, { grenze: KAPPUNGSGRENZE_PROZENT }) : undefined,
                      }}
                      t={t}
                      ausrichtung="rechts"
                    />
                  ) : (
                    "–"
                  )}
                </td>
              )}
              <td>{status(e)}</td>
            </tr>
            {e.ausgeschlossen === null && (
              <tr>
                <td />
                <td colSpan={erhoehung ? 6 : 4} className="pt-0">
                  <details>
                    <summary className="cursor-pointer text-xs text-sky-700">{ts.brief}</summary>
                    <div className="mt-2 rounded border border-slate-200 bg-white p-4 text-sm" data-brief={e.mieter}>
                      <div className="text-xs text-slate-500">{e.gesellschaft}</div>
                      <div className="mt-2">{(e.anschrift ?? [e.mieter, ts.keineAnschrift]).map((z) => <div key={z}>{z}</div>)}</div>
                      <div className="mt-4 text-right">{f.datum(parameter.datum)}</div>
                      <div className="mt-3 font-semibold">{e.betreff}</div>
                      <div className="mt-3 whitespace-pre-wrap">{e.text}</div>
                    </div>
                  </details>
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </Tabelle>
  );

  return (
    <div className="max-w-6xl space-y-6">
      {kopf}
      <Kacheln>
        <Kachel titel={ts.kacheln.empfaenger} wert={empfaenger.length} />
        <Kachel titel={ts.kacheln.bereit} wert={bereit.length} ton={bereit.length > 0 ? "gut" : undefined} />
        <Kachel titel={ts.kacheln.luecken} wert={luecken.length} ton={luecken.length > 0 ? "warnung" : undefined} />
        {erhoehung && <Kachel titel={ts.kacheln.ausgeschlossen} wert={ausgeschlossen.length} unter={ueberKappung > 0 ? `${ueberKappung} ${ts.kappungKachel}` : undefined} ton={ueberKappung > 0 ? "schlecht" : undefined} />}
      </Kacheln>
      {ueberKappung > 0 && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">{fuelle(ts.kappungAnzahl, { anzahl: ueberKappung, grenze: KAPPUNGSGRENZE_PROZENT })}</p>}
      <Karte titel={vorlage.name} aktionen={bereit.length > 0 ? <KnopfLink href={`/api/serienbriefe?${pdfQuery}`}>{ts.vorschauPdf}</KnopfLink> : undefined}>
        {erhoehung && <p className="mb-3 text-xs text-slate-500">{ts.hinweisAusgeschlossen}</p>}
        {empfaenger.length === 0 ? (
          <Leer>{ts.keineEmpfaenger}</Leer>
        ) : darfAblegen && bereit.length > 0 ? (
          <Formular aktion={serieErstellen} absenden={ts.erstellenAblegen} bestaetigen={ts.erstellenFrage} laeuftText={ts.erstellenLaeuft}>
            {Object.entries(anfrage).map(([k, w]) => (w ? <input key={k} type="hidden" name={k} value={w} /> : null))}
            {tabelle}
            <p className="text-xs text-slate-500">{fuelle(ts.ablageHinweis, { kategorie })}</p>
          </Formular>
        ) : (
          tabelle
        )}
      </Karte>
      <Glossar begriffe={["JNKM"]} t={t} />
    </div>
  );
}
