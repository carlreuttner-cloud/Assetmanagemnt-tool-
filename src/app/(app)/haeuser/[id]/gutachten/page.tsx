import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Liniendiagramm, type Reihe } from "@/components/diagramme";
import { Begriff, Glossar, MitHerleitung, Unbekannt, type GlossarBegriff } from "@/components/herleitung";
import { Karte, KnopfLink, Leer, Seitenkopf, Tabelle } from "@/components/ui";
import { fuelle, texte, type Texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { isoDatum } from "@/lib/datum";
import { erlaubt } from "@/lib/daten/portfolio";
import { formatierer, type Formatierer } from "@/lib/format";
import { dezimal, type Decimal } from "@/lib/geld";
import { gebaeudewert } from "@/lib/bewertung";
import { gutachtenVerlauf, swotPunkte, type GutachtenDaten, type GutachtenPruefwerte } from "@/lib/gutachten";

const opt = (w: { toFixed(): string } | null) => (w === null ? null : dezimal(w));

export default async function GutachtenSeite({ params }: PageProps<"/haeuser/[id]/gutachten">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("haeuser");
  const t = texte(kontext.mandant.sprache);
  const f = formatierer(kontext.mandant);
  const tg = t.gutachten;
  const sicht = await sichtbarkeit(kontext);
  const haus = await kontext.db.haus.findFirst({
    where: { id: erlaubt(sicht.hausIds, id) },
    select: {
      id: true,
      bezeichnung: true,
      gutachten: true,
      verkehrswerte: { where: { gutachten: null }, orderBy: { stichtag: "asc" }, select: { id: true, stichtag: true, wert: true, quelle: true } },
    },
  });
  if (!haus) notFound();
  const schreiben = darf(kontext.rolle, "haeuser", "schreiben");

  const liste = haus.gutachten.map((g) => ({
    ...g,
    daten: {
      id: g.id,
      stichtag: isoDatum(g.stichtag),
      verkehrswert: dezimal(g.verkehrswert),
      rohertragJahr: opt(g.rohertragJahr),
      bewirtschaftungskosten: opt(g.bewirtschaftungskosten),
      reinertragJahr: opt(g.reinertragJahr),
      liegenschaftszins: opt(g.liegenschaftszins),
      restnutzungsdauer: g.restnutzungsdauer,
      barwertfaktor: opt(g.barwertfaktor),
      bodenwert: opt(g.bodenwert),
      ertragswert: opt(g.ertragswert),
      wohnflaeche: opt(g.wohnflaeche),
      gewerbeflaeche: opt(g.gewerbeflaeche),
    } satisfies GutachtenDaten,
  }));
  const verlauf = gutachtenVerlauf(liste.map((g) => ({ ...g.daten, roh: g })));
  type Spalte = (typeof verlauf)[number];

  const fehlt = <span className="text-xs italic text-slate-400">{tg.nichtAngegeben}</span>;
  const wert = (w: ReactNode | null | undefined) => (w === null || w === undefined || w === "" || w === false ? fehlt : w);
  const zeile = (label: ReactNode, inhalt: (s: Spalte) => ReactNode) => ({ label, inhalt });
  const begriff = (k: GlossarBegriff, text: string) => (
    <Begriff k={k} t={t}>
      {text}
    </Begriff>
  );

  const abschnitte: Array<{ titel: string; hinweis?: string; zeilen: ReturnType<typeof zeile>[] }> = [
    {
      titel: tg.abschnittWerte,
      zeilen: [
        zeile(tg.verkehrswert, ({ g }) => <span className="font-semibold">{f.betragGanz(g.verkehrswert)}</span>),
        zeile(tg.veraenderung, ({ p }) => <Veraenderung p={p} f={f} />),
        zeile(begriff("Bodenwert", tg.bodenwert), ({ g }) => wert(g.bodenwert && f.betragGanz(g.bodenwert))),
        zeile(begriff("Gebaeudewert", tg.gebaeudewert), ({ g }) => <GebaeudewertZelle g={g.roh} t={t} f={f} />),
        zeile(tg.verfahren, ({ g }) => wert(g.roh.verfahren && tg.verfahrenArten[g.roh.verfahren])),
        zeile(tg.anlass, ({ g }) => wert(g.roh.anlass)),
        zeile(tg.erstelltAm, ({ g }) => wert(g.roh.erstelltAm && f.datum(g.roh.erstelltAm))),
        zeile(begriff("Ertragswert", tg.ertragswert), ({ g }) => wert(g.ertragswert && f.betragGanz(g.ertragswert))),
        zeile(tg.sachwert, ({ g }) => wert(g.roh.sachwert && f.betragGanz(g.roh.sachwert))),
        zeile(tg.vergleichswert, ({ g }) => wert(g.roh.vergleichswert && f.betragGanz(g.roh.vergleichswert))),
        zeile(tg.zuAbschlaege, ({ g }) => wert(g.roh.zuAbschlaege && f.betragGanz(g.roh.zuAbschlaege))),
      ],
    },
    {
      titel: tg.abschnittFaktoren,
      zeilen: [
        zeile(begriff("Rohertrag", tg.rohertragJahr), ({ g }) => wert(g.rohertragJahr && f.betragGanz(g.rohertragJahr))),
        zeile(begriff("Bewirtschaftungskosten", tg.bewirtschaftungskosten), ({ g }) => wert(g.bewirtschaftungskosten && f.betragGanz(g.bewirtschaftungskosten))),
        zeile(begriff("Reinertrag", tg.reinertragJahr), ({ g }) => wert(g.reinertragJahr && f.betragGanz(g.reinertragJahr))),
        zeile(begriff("Liegenschaftszins", tg.liegenschaftszins), ({ g }) => wert(g.liegenschaftszins && f.prozent(g.liegenschaftszins, 2))),
        zeile(begriff("Restnutzungsdauer", tg.restnutzungsdauer), ({ g }) => wert(g.restnutzungsdauer !== null && fuelle(tg.jahre, { jahre: String(g.restnutzungsdauer) }))),
        zeile(tg.gesamtnutzungsdauer, ({ g }) => wert(g.roh.gesamtnutzungsdauer !== null && fuelle(tg.jahre, { jahre: String(g.roh.gesamtnutzungsdauer) }))),
        zeile(begriff("Barwertfaktor", tg.barwertfaktor), ({ g }) => wert(g.barwertfaktor && f.faktor(g.barwertfaktor, 4))),
      ],
    },
    {
      titel: tg.abschnittPruefung,
      hinweis: tg.rechnerischHinweis,
      zeilen: [
        zeile(tg.bwkProzent, (s) => <Pruefwert s={s} art="bwk" t={t} f={f} />),
        zeile(begriff("Rohertragsfaktor", tg.rohertragsfaktor), (s) => <Pruefwert s={s} art="rohertragsfaktor" t={t} f={f} />),
        zeile(tg.wertProM2, (s) => <Pruefwert s={s} art="wertProM2" t={t} f={f} />),
        zeile(tg.barwertfaktorRechnerisch, (s) => <Pruefwert s={s} art="barwertfaktor" t={t} f={f} />),
        zeile(tg.ertragswertRechnerisch, (s) => <Pruefwert s={s} art="ertragswert" t={t} f={f} />),
      ],
    },
    {
      titel: tg.abschnittObjekt,
      zeilen: [
        zeile(tg.baujahr, ({ g }) => wert(g.roh.baujahr)),
        zeile(tg.einheiten, ({ g }) => wert(g.roh.einheiten)),
        zeile(tg.wohnflaeche, ({ g }) => wert(g.wohnflaeche && f.flaeche(g.wohnflaeche))),
        zeile(tg.gewerbeflaeche, ({ g }) => wert(g.gewerbeflaeche && f.flaeche(g.gewerbeflaeche))),
        zeile(tg.grundstuecksflaeche, ({ g }) => wert(g.roh.grundstuecksflaeche && f.flaeche(g.roh.grundstuecksflaeche))),
        zeile(tg.zustand, ({ g }) => wert(g.roh.zustand)),
        zeile(tg.energieklasse, ({ g }) => wert(g.roh.energieklasse)),
        zeile(tg.lage, ({ g }) => wert(g.roh.lage)),
      ],
    },
  ];

  const chronologisch = [...verlauf].reverse();
  const reihen: Reihe[] = [
    { name: tg.verkehrswert, punkte: chronologisch.map(({ g }) => ({ x: g.stichtag, y: g.verkehrswert })) },
    { name: tg.bodenwert, punkte: chronologisch.map(({ g }) => ({ x: g.stichtag, y: g.bodenwert })) },
    { name: tg.gebaeudewert, punkte: chronologisch.map(({ g }) => ({ x: g.stichtag, y: gebaeudewert({ verkehrswert: g.verkehrswert, bodenwert: g.bodenwert, gebaeudewert: opt(g.roh.gebaeudewert) }).wert })) },
    ...(haus.verkehrswerte.length > 0
      ? [{ name: tg.marktwerte, gestrichelt: true, punkte: haus.verkehrswerte.map((v) => ({ x: isoDatum(v.stichtag), y: dezimal(v.wert) })) }]
      : []),
  ];

  return (
    <div className="space-y-6">
      <Seitenkopf
        titel={tg.historie}
        beschreibung={`${haus.bezeichnung} · ${tg.beschreibung}`}
        zurueck={{ href: `/haeuser/${id}`, text: haus.bezeichnung }}
        aktionen={
          schreiben && (
            <KnopfLink href={`/haeuser/${id}/gutachten/neu`} art="primaer">
              {tg.neu}
            </KnopfLink>
          )
        }
      />

      {verlauf.length === 0 ? (
        <Karte>
          <Leer>{tg.keine}</Leer>
        </Karte>
      ) : (
        <>
          {chronologisch.length + haus.verkehrswerte.length > 1 && (
            <Karte titel={tg.diagrammWerte} className="max-w-3xl">
              <Liniendiagramm reihen={reihen} formatY={(w) => f.betragKurz(w)} formatX={(d) => f.datum(d)} ab0 />
            </Karte>
          )}

          {haus.verkehrswerte.length > 0 && (
            <Karte titel={<Begriff k="Marktwert" t={t}>{tg.marktwerte}</Begriff>} className="max-w-3xl">
              <Tabelle>
                <thead>
                  <tr>
                    <th>{t.bewertung.stichtag}</th>
                    <th className="text-right">{t.bewertung.wert}</th>
                    <th>{t.herleitung.quelle}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...haus.verkehrswerte].reverse().map((v) => (
                    <tr key={v.id}>
                      <td>{f.datum(v.stichtag)}</td>
                      <td className="text-right tabular-nums">{f.betragGanz(v.wert)}</td>
                      <td>{v.quelle ?? <Unbekannt t={t} />}</td>
                    </tr>
                  ))}
                </tbody>
              </Tabelle>
            </Karte>
          )}

          <Karte>
            <Tabelle>
              <thead>
                <tr>
                  <th className="w-64" />
                  {verlauf.map(({ g }) => (
                    <th key={g.id} id={`g-${g.id}`} className="align-top">
                      <div className="text-sm font-semibold normal-case text-slate-900">{f.datum(g.roh.stichtag)}</div>
                      <div className="text-xs font-normal normal-case text-slate-500">{g.roh.gutachter ?? tg.nichtAngegeben}</div>
                      {schreiben && (
                        <Link href={`/haeuser/${id}/gutachten/${g.id}`} className="text-xs font-normal normal-case text-slate-600 hover:underline">
                          {t.allgemein.bearbeiten}
                        </Link>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {abschnitte.flatMap((a) => [
                  <tr key={a.titel} className="bg-slate-50">
                    <td colSpan={verlauf.length + 1} className="font-semibold text-slate-800">
                      {a.titel}
                      {a.hinweis && <div className="text-xs font-normal text-slate-500">{a.hinweis}</div>}
                    </td>
                  </tr>,
                  ...a.zeilen.map((z, i) => (
                    <tr key={`${a.titel}-${i}`}>
                      <td className="text-slate-600">{z.label}</td>
                      {verlauf.map((s) => (
                        <td key={s.g.id} className="tabular-nums">
                          {z.inhalt(s)}
                        </td>
                      ))}
                    </tr>
                  )),
                ])}
              </tbody>
            </Tabelle>
          </Karte>

          <section className="space-y-3">
            <h2 className="text-base font-semibold">
              <Begriff k="SWOT" t={t}>
                {tg.abschnittSwot}
              </Begriff>
            </h2>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {verlauf.map(({ g }) => (
                <Karte key={g.id} titel={`${f.datum(g.roh.stichtag)} · ${g.roh.gutachter ?? tg.nichtAngegeben}`}>
                  <Swot g={g.roh} t={t} />
                </Karte>
              ))}
            </div>
          </section>
        </>
      )}

      <Glossar
        begriffe={["Bodenwert", "Gebaeudewert", "Marktwert", "Rohertrag", "Bewirtschaftungskosten", "Reinertrag", "Liegenschaftszins", "Restnutzungsdauer", "Barwertfaktor", "Ertragswert", "Rohertragsfaktor", "SWOT"]}
        t={t}
      />
    </div>
  );
}

function GebaeudewertZelle({ g, t, f }: { g: { verkehrswert: { toFixed(): string }; bodenwert: { toFixed(): string } | null; gebaeudewert: { toFixed(): string } | null; stichtag: Date; gutachter: string | null }; t: Texte; f: Formatierer }) {
  const tg = t.gutachten;
  const gw = gebaeudewert({ verkehrswert: dezimal(g.verkehrswert), bodenwert: opt(g.bodenwert), gebaeudewert: opt(g.gebaeudewert) });
  if (!gw.wert) return <MitHerleitung wert={<Unbekannt t={t} />} herleitung={{ berechnung: tg.gebaeudewertFormel, fehlt: [tg.bodenwert] }} t={t} />;
  return (
    <MitHerleitung
      wert={
        <>
          {f.betragGanz(gw.wert)}
          {gw.art === "abgeleitet" && <span className="ml-1 text-xs text-slate-500">({tg.gebaeudewertAbgeleitet})</span>}
        </>
      }
      herleitung={{
        berechnung: gw.art === "gutachten" ? tg.gebaeudewertLautGutachten : tg.gebaeudewertFormel,
        werte:
          gw.art === "abgeleitet"
            ? [
                [tg.verkehrswert, f.betragGanz(g.verkehrswert)],
                [tg.bodenwert, f.betragGanz(g.bodenwert)],
              ]
            : [],
        quelle: g.gutachter ?? tg.titel,
        stichtag: f.datum(g.stichtag),
      }}
      t={t}
    />
  );
}

function Veraenderung({ p, f }: { p: GutachtenPruefwerte; f: Formatierer }) {
  if (!p.veraenderung) return <span className="text-slate-400">–</span>;
  const ton = p.veraenderung.isNegative() ? "text-red-700" : p.veraenderung.isZero() ? "text-slate-600" : "text-emerald-700";
  const vorzeichen = p.veraenderung.isNegative() ? "" : "+";
  return (
    <span className={ton}>
      {vorzeichen}
      {f.betragGanz(p.veraenderung)}
      {p.veraenderungProzent && ` (${vorzeichen}${f.prozent(p.veraenderungProzent, 1)})`}
    </span>
  );
}

type PruefArt = "bwk" | "rohertragsfaktor" | "wertProM2" | "barwertfaktor" | "ertragswert";

/** Rechnerischer Kontrollwert mit Herleitung; fehlen Angaben, bleibt er unbekannt und nennt sie. */
function Pruefwert({
  s,
  art,
  t,
  f,
}: {
  s: { g: GutachtenDaten; p: GutachtenPruefwerte };
  art: PruefArt;
  t: Texte;
  f: Formatierer;
}) {
  const { g, p } = s;
  const tg = t.gutachten;
  const fehlend = (paare: Array<[string, unknown]>) => paare.filter(([, w]) => w === null || w === undefined).map(([n]) => n);
  const rein = g.reinertragJahr ?? p.reinertrag;
  const bwf = g.barwertfaktor ?? p.barwertfaktor;
  const def: Record<PruefArt, { wert: Decimal | null; text: (w: Decimal) => string; formel: string; werte: Array<[string, string]>; fehlt: string[]; hinweis?: string }> = {
    bwk: {
      wert: p.bewirtschaftungskostenProzent,
      text: (w) => f.prozent(w, 1),
      formel: `${tg.bewirtschaftungskosten} ÷ ${tg.rohertragJahr} × 100`,
      werte: [
        [tg.bewirtschaftungskosten, f.betragGanz(g.bewirtschaftungskosten)],
        [tg.rohertragJahr, f.betragGanz(g.rohertragJahr)],
      ],
      fehlt: fehlend([
        [tg.bewirtschaftungskosten, g.bewirtschaftungskosten],
        [tg.rohertragJahr, g.rohertragJahr],
      ]),
    },
    rohertragsfaktor: {
      wert: p.rohertragsfaktor,
      text: (w) => f.faktor(w, 1),
      formel: `${tg.verkehrswert} ÷ ${tg.rohertragJahr}`,
      werte: [
        [tg.verkehrswert, f.betragGanz(g.verkehrswert)],
        [tg.rohertragJahr, f.betragGanz(g.rohertragJahr)],
      ],
      fehlt: fehlend([[tg.rohertragJahr, g.rohertragJahr]]),
    },
    wertProM2: {
      wert: p.wertProM2,
      text: (w) => f.betragGanz(w),
      formel: `${tg.verkehrswert} ÷ (${tg.wohnflaeche} + ${tg.gewerbeflaeche})`,
      werte: [
        [tg.verkehrswert, f.betragGanz(g.verkehrswert)],
        [tg.wohnflaeche, f.flaeche(g.wohnflaeche)],
        [tg.gewerbeflaeche, f.flaeche(g.gewerbeflaeche)],
      ],
      fehlt: g.wohnflaeche || g.gewerbeflaeche ? [] : [tg.wohnflaeche],
    },
    barwertfaktor: {
      wert: p.barwertfaktor,
      text: (w) => f.faktor(w, 4),
      formel: t.glossar.Barwertfaktor.lang,
      werte: [
        [tg.liegenschaftszins, f.prozent(g.liegenschaftszins, 2)],
        [tg.restnutzungsdauer, g.restnutzungsdauer === null ? "–" : fuelle(tg.jahre, { jahre: String(g.restnutzungsdauer) })],
        [tg.barwertfaktor, f.faktor(g.barwertfaktor, 4)],
      ],
      fehlt: fehlend([
        [tg.liegenschaftszins, g.liegenschaftszins],
        [tg.restnutzungsdauer, g.restnutzungsdauer],
      ]),
      hinweis: p.barwertfaktor && g.barwertfaktor ? fuelle(tg.abweichung, { betrag: f.faktor(p.barwertfaktor.minus(g.barwertfaktor), 4) }) : undefined,
    },
    ertragswert: {
      wert: p.ertragswert,
      text: (w) => f.betragGanz(w),
      formel: t.glossar.Ertragswert.lang,
      werte: [
        [tg.reinertragJahr, f.betragGanz(rein)],
        [tg.bodenwert, f.betragGanz(g.bodenwert)],
        [tg.liegenschaftszins, f.prozent(g.liegenschaftszins, 2)],
        [tg.barwertfaktor, f.faktor(bwf, 4)],
      ],
      fehlt: fehlend([
        [tg.reinertragJahr, rein],
        [tg.bodenwert, g.bodenwert],
        [tg.liegenschaftszins, g.liegenschaftszins],
        [tg.barwertfaktor, bwf],
      ]),
      hinweis: p.ertragswert && g.ertragswert ? fuelle(tg.abweichung, { betrag: f.betragGanz(p.ertragswert.minus(g.ertragswert)) }) : undefined,
    },
  };
  const d = def[art];
  return (
    <MitHerleitung
      wert={d.wert ? d.text(d.wert) : <Unbekannt t={t} />}
      herleitung={{ berechnung: d.formel, werte: d.werte, quelle: tg.titel, stichtag: f.datum(g.stichtag), fehlt: d.fehlt, hinweis: d.hinweis }}
      t={t}
      ausrichtung="rechts"
    />
  );
}

function Swot({ g, t }: { g: { staerken: string | null; schwaechen: string | null; chancen: string | null; risiken: string | null }; t: Texte }) {
  const tg = t.gutachten;
  const felder = [
    { titel: tg.staerken, punkte: swotPunkte(g.staerken), farbe: "border-emerald-200 bg-emerald-50" },
    { titel: tg.schwaechen, punkte: swotPunkte(g.schwaechen), farbe: "border-red-200 bg-red-50" },
    { titel: tg.chancen, punkte: swotPunkte(g.chancen), farbe: "border-sky-200 bg-sky-50" },
    { titel: tg.risiken, punkte: swotPunkte(g.risiken), farbe: "border-amber-200 bg-amber-50" },
  ];
  if (felder.every((x) => x.punkte.length === 0)) return <Leer>{tg.keineSwot}</Leer>;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {felder.map((x) => (
        <div key={x.titel} className={`rounded-lg border p-3 text-sm ${x.farbe}`}>
          <div className="mb-1 font-semibold">{x.titel}</div>
          {x.punkte.length === 0 ? (
            <span className="text-xs italic text-slate-500">{tg.nichtAngegeben}</span>
          ) : (
            <ul className="list-disc space-y-0.5 pl-4">
              {x.punkte.map((pkt, i) => (
                <li key={i}>{pkt}</li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
