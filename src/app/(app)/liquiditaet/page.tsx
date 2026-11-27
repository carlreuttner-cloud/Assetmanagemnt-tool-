import Link from "next/link";
import { AuswahlFilter, FilterZeile } from "@/components/auswahl-filter";
import { Liniendiagramm } from "@/components/diagramme";
import { Formular } from "@/components/formular";
import { Begriff, Glossar, MitHerleitung, Unbekannt } from "@/components/herleitung";
import { Auswahl, Feld, Felder, Kachel, Kacheln, Karte, Leer, Marke, MieteZelle, Seitenkopf, Tabelle, rechts, type Ton } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { formatMonat, heute, monatsNummer } from "@/lib/datum";
import { ladeLiquiditaet } from "@/lib/daten/liquiditaet";
import { ladeRechengrundlage } from "@/lib/daten/portfolio";
import { formatierer } from "@/lib/format";
import { dezimal, type Decimal } from "@/lib/geld";
import type { LiquiditaetMonat, MonatStatus } from "@/lib/liquiditaet";
import { LiquiditaetUebersicht } from "./uebersicht";
import { kontostandHinzufuegen, kontostandLoeschen, mindestliquiditaetSpeichern, planpositionHinzufuegen, planpositionLoeschen } from "./aktionen";

const STATUS_TON: Record<MonatStatus, Ton> = { engpass: "schlecht", unterMindest: "warnung", ok: "gut" };

export default async function LiquiditaetSeite({ searchParams }: PageProps<"/liquiditaet">) {
  const kontext = await pruefeZugriff("gesellschaften");
  const t = texte(kontext.mandant.sprache);
  const tl = t.liquiditaet;
  const f = formatierer(kontext.mandant);
  const stichtag = heute();
  const sp = await searchParams;
  const basis = await ladeRechengrundlage(kontext, { bereich: true });
  const sichtbar = await kontext.db.gesellschaft.findMany({
    where: basis.sicht.gesellschaftIds === "alle" ? {} : { id: { in: basis.sicht.gesellschaftIds } },
    select: { id: true },
  });
  const alle = await ladeLiquiditaet(kontext, basis, sichtbar.map((g) => g.id), stichtag);
  const schreiben = darf(kontext.rolle, "gesellschaften", "schreiben");

  if (alle.length === 0) {
    return (
      <div>
        <Seitenkopf titel={tl.titel} beschreibung={tl.beschreibung} />
        <Leer>{tl.keine}</Leer>
      </div>
    );
  }
  // Ohne Auswahl (oder bei nur einer Gesellschaft deren Plan): Übersicht aller Gesellschaften.
  const g = alle.length === 1 ? alle[0] : alle.find((x) => x.id === sp.g);
  const marke = (x: (typeof alle)[number]) => (x.plan.ersterEngpass ? ` ⚠ ${tl.uebersicht.markeEngpass}` : x.plan.ersteUnterschreitung ? ` ! ${tl.uebersicht.markeMindest}` : "");
  const auswahl =
    alle.length > 1 ? (
      <FilterZeile>
        <AuswahlFilter
          name="g"
          label={t.listen.gesellschaft}
          optionen={[
            { href: "/liquiditaet", text: tl.uebersicht.alle, aktiv: !g },
            ...alle.map((x) => ({ href: `/liquiditaet?g=${x.id}`, text: `${x.name}${marke(x)}`, aktiv: x.id === g?.id })),
          ]}
        />
      </FilterZeile>
    ) : null;
  if (!g) {
    return (
      <div className="max-w-6xl space-y-6">
        <Seitenkopf titel={tl.titel} beschreibung={tl.beschreibung} />
        {auswahl}
        <LiquiditaetUebersicht alle={alle} t={t} f={f} />
        <Glossar begriffe={["Liquiditaet", "Engpass"]} t={t} />
      </div>
    );
  }
  const plan = g.plan;
  const kreditName = new Map(basis.kredite.map((k) => [k.id, k.bezeichnung]));
  const massnahmeName = (id: string) => g.massnahmen.get(id)?.bezeichnung ?? id;
  const position = new Map(g.positionen.map((p) => [p.id, p]));
  const betrag = (w: Decimal) => f.betragGanz(w);
  const minus = (w: Decimal) => (w.isZero() ? <span className="text-slate-300" title={tl.keineZahlung}>–</span> : `−${f.betragGanz(w)}`);
  const plus = (w: Decimal) => (w.isZero() ? <span className="text-slate-300" title={tl.keineZahlung}>–</span> : f.betragGanz(w));
  const zeitraum = fuelle(tl.zeitraum, { von: f.datum(plan.beginn), bis: f.datum(plan.ende) });
  const anfangsKonten = new Set(plan.anfangsbestand.konten.map((k) => k.id));
  const imPlan = (monat: string) => monatsNummer(monat) >= monatsNummer(plan.beginn) && monatsNummer(monat) <= monatsNummer(plan.ende);

  const anfang = plan.anfangsbestand;
  const stichtagText =
    anfang.vonStichtag && anfang.bisStichtag
      ? anfang.vonStichtag === anfang.bisStichtag
        ? f.datum(anfang.vonStichtag)
        : `${f.datum(anfang.vonStichtag)} – ${f.datum(anfang.bisStichtag)}`
      : undefined;
  const anfangWert = (
    <MitHerleitung
      wert={anfang.summe === null ? <Unbekannt t={t} grund={tl.keinKontostand} /> : betrag(anfang.summe)}
      herleitung={{
        berechnung: tl.anfangFormel,
        werte: anfang.konten.map((k) => [`${k.konto} (${f.datum(k.stichtag)})`, betrag(k.betrag)]),
        quelle: anfang.konten.map((k) => k.quelle).filter(Boolean).join(", ") || undefined,
        stichtag: stichtagText,
        fehlt: anfang.summe === null ? [tl.keinKontostand] : undefined,
        hinweis: [anfang.vonStichtag !== anfang.bisStichtag ? fuelle(tl.stichtageGemischt, { von: f.datum(anfang.vonStichtag!), bis: f.datum(anfang.bisStichtag!) }) : null, tl.anfangHinweis]
          .filter(Boolean)
          .join(" "),
      }}
      t={t}
    />
  );
  const lueckenTexte = [
    ...plan.luecken.kredite.map((l) => fuelle(l.grund === "saldo" ? tl.lueckeKreditSaldo : tl.lueckeKreditZins, { kredit: kreditName.get(l.kreditId) ?? "" })),
    ...plan.luecken.massnahmeOhneBudget.map((id) => fuelle(tl.lueckeBudget, { massnahme: massnahmeName(id) })),
    ...plan.luecken.massnahmeOhneEnde.map((id) => fuelle(tl.lueckeEnde, { massnahme: massnahmeName(id) })),
  ];
  const hinweisTexte = [
    ...plan.hinweise.zinsbindungEndet.map((id) => fuelle(tl.hinweisZinsbindung, { kredit: kreditName.get(id) ?? "" })),
    ...plan.hinweise.variabel.map((id) => fuelle(tl.hinweisVariabel, { kredit: kreditName.get(id) ?? "" })),
    ...plan.hinweise.sicherungEndet.map((id) => fuelle(tl.hinweisSicherung, { kredit: kreditName.get(id) ?? "" })),
    ...plan.hinweise.massnahmeUeberfaellig.map((id) => fuelle(tl.hinweisUeberfaellig, { massnahme: massnahmeName(id) })),
  ];
  const summeHerleitung = (formel: string, wert: Decimal) => (
    <MitHerleitung
      wert={betrag(wert)}
      herleitung={{ berechnung: formel, stichtag: zeitraum, fehlt: plan.vollstaendig ? undefined : lueckenTexte }}
      t={t}
    />
  );
  const ersteMiete = plan.monate[0]?.mieten ?? dezimal(0);
  const mitSchluss = !plan.summen.schlusszahlung.isZero();
  const mitEinnahmen = !plan.summen.sonstigeEinnahmen.isZero();

  // Zellen mit Herleitung
  const kapitaldienstZelle = (m: LiquiditaetMonat) => {
    const summe = m.zins.plus(m.tilgung);
    if (summe.isZero()) return minus(summe);
    return (
      <MitHerleitung
        ausrichtung="rechts"
        wert={minus(summe)}
        herleitung={{
          berechnung: tl.kapitaldienstFormel,
          werte: m.kredite
            .filter((k) => !k.zins.plus(k.tilgung).isZero())
            .map((k) => [
              kreditName.get(k.kreditId) ?? "",
              `${fuelle(tl.zinsTilgung, { zins: f.betrag(k.zins), tilgung: f.betrag(k.tilgung) })} (${k.quelle === "tilgungsplan" ? tl.quelleTilgungsplan : tl.quelleBerechnet})`,
            ]),
          fehlt: plan.luecken.kredite.length ? lueckenTexte.slice(0, plan.luecken.kredite.length) : undefined,
        }}
        t={t}
      />
    );
  };
  const positionenZelle = (m: LiquiditaetMonat, art: "AUSSCHUETTUNG" | "EINNAHME" | "AUSGABE", wert: Decimal, vorzeichen: typeof plus) => {
    if (wert.isZero()) return vorzeichen(wert);
    const eigene = m.positionen.map((id) => position.get(id)!).filter((p) => p.art === art);
    return (
      <MitHerleitung
        ausrichtung="rechts"
        wert={vorzeichen(wert)}
        herleitung={{
          werte: eigene.map((p) => [p.bezeichnung, f.betrag(p.betrag)]),
          quelle: [...new Set(eigene.map((p) => p.quelle ?? tl.positionQuelle))].join(", "),
        }}
        t={t}
      />
    );
  };

  return (
    <div className="max-w-6xl space-y-6">
      <Seitenkopf titel={tl.titel} beschreibung={tl.beschreibung} />
      {auswahl}

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">
          <Link href={`/gesellschaften/${g.id}`} className="hover:underline">
            {g.name}
          </Link>
        </h2>
        <p className="text-sm text-slate-500">{zeitraum}</p>
      </div>

      {anfang.summe === null ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{tl.bestandUnbekannt}</p>
      ) : plan.ersterEngpass ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alert">
          <p className="font-semibold">
            <Begriff k="Engpass" t={t}>
              {fuelle(tl.engpass, { monat: formatMonat(plan.ersterEngpass), bestand: betrag(plan.tiefsterBestand!.bestand) })}
            </Begriff>
          </p>
          <p className="mt-1">{tl.engpassText}</p>
        </div>
      ) : plan.ersteUnterschreitung ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
          {fuelle(tl.unterMindest, { monat: formatMonat(plan.ersteUnterschreitung), mindest: betrag(g.mindestliquiditaet!), bestand: betrag(plan.tiefsterBestand!.bestand) })}
        </p>
      ) : (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{tl.keinEngpass}</p>
      )}

      <Kacheln>
        <Kachel titel={<Begriff k="Liquiditaet" t={t}>{tl.kachelAnfang}</Begriff>} wert={anfangWert} unter={stichtagText} />
        <Kachel
          titel={<>{tl.kachelMieten} (<Begriff k="JNKM" t={t} />)</>}
          wert={
            <MitHerleitung
              wert={<MieteZelle monat={`${f.betrag(ersteMiete)} / ${t.allgemein.monat}`} jahr={`${f.jahresmiete(ersteMiete)} / ${t.allgemein.jahr}`} />}
              herleitung={{ berechnung: tl.mietenFormel, quelle: tl.mietenQuelle, stichtag: f.datum(plan.beginn), hinweis: tl.mietenHinweis }}
              t={t}
            />
          }
        />
        <Kachel titel={tl.kachelEinnahmen} wert={summeHerleitung(tl.einnahmenFormel, plan.summen.einnahmen)} />
        <Kachel titel={tl.kachelAusgaben} wert={summeHerleitung(tl.ausgabenFormel, plan.summen.ausgaben)} />
        <Kachel
          titel={tl.kachelTiefster}
          ton={plan.ersterEngpass ? "schlecht" : plan.ersteUnterschreitung ? "warnung" : undefined}
          wert={plan.tiefsterBestand ? betrag(plan.tiefsterBestand.bestand) : <Unbekannt t={t} grund={tl.keinKontostand} />}
          unter={
            <>
              {plan.tiefsterBestand && <>{fuelle(tl.tiefsterIm, { monat: formatMonat(plan.tiefsterBestand.monat) })} · </>}
              <Begriff k="Mindestliquiditaet" t={t}>
                {g.mindestliquiditaet ? fuelle(tl.mindest, { wert: betrag(g.mindestliquiditaet) }) : tl.mindestKeine}
              </Begriff>
            </>
          }
        />
      </Kacheln>

      {(lueckenTexte.length > 0 || hinweisTexte.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {lueckenTexte.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p className="font-semibold">{tl.luecken}</p>
              <ul className="mt-1 list-disc pl-5">
                {lueckenTexte.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          )}
          {hinweisTexte.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-semibold">{tl.hinweise}</p>
              <ul className="mt-1 list-disc pl-5">
                {hinweisTexte.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <Karte titel={anfang.summe === null ? tl.diagrammKumuliert : tl.diagramm}>
        <Liniendiagramm
          formatY={(w) => f.betragGanz(w)}
          formatX={(d) => formatMonat(d)}
          nullLinie
          reihen={
            anfang.summe === null
              ? [{ name: tl.reiheKumuliert, punkte: plan.monate.map((m) => ({ x: m.monat, y: m.kumuliert })) }]
              : [
                  { name: tl.reiheBestand, punkte: plan.monate.map((m) => ({ x: m.monat, y: m.bestand })) },
                  ...(g.mindestliquiditaet
                    ? [{ name: tl.reiheMindest, gestrichelt: true, farbe: "#b45309", punkte: plan.monate.map((m) => ({ x: m.monat, y: g.mindestliquiditaet })) }]
                    : []),
                ]
          }
        />
      </Karte>

      <Karte titel={tl.tabelle}>
        <Tabelle>
          <thead>
            <tr>
              <th>{tl.monat}</th>
              <th className={rechts}>{tl.mieten}</th>
              <th className={rechts}>
                <Begriff k="Kapitaldienst" t={t}>{tl.kapitaldienst}</Begriff>
              </th>
              {mitSchluss && (
                <th className={rechts}>
                  <Begriff k="Schlusszahlung" t={t}>{tl.schlusszahlung}</Begriff>
                </th>
              )}
              <th className={rechts}>{tl.investitionen}</th>
              <th className={rechts}>{tl.ausschuettungen}</th>
              {mitEinnahmen && <th className={rechts}>{tl.sonstigeEinnahmen}</th>}
              <th className={rechts}>{tl.sonstigeAusgaben}</th>
              <th className={rechts}>{tl.saldo}</th>
              <th className={rechts}>{anfang.summe === null ? tl.kumuliert : tl.bestand}</th>
              {anfang.summe !== null && <th />}
            </tr>
          </thead>
          <tbody>
            {plan.monate.map((m) => (
              <tr key={m.monat} className={m.status === "engpass" ? "bg-red-50" : m.status === "unterMindest" ? "bg-amber-50" : undefined}>
                <td className="whitespace-nowrap">{formatMonat(m.monat)}</td>
                <td className={rechts}>
                  <MitHerleitung
                    ausrichtung="rechts"
                    wert={plus(m.mieten)}
                    herleitung={{
                      berechnung: tl.mietenFormel,
                      werte: [[<Begriff key="j" k="JNKM" t={t} />, f.jahresmiete(m.mieten)]],
                      quelle: tl.mietenQuelle,
                      stichtag: f.datum(m.monat),
                    }}
                    t={t}
                  />
                </td>
                <td className={rechts}>{kapitaldienstZelle(m)}</td>
                {mitSchluss && (
                  <td className={rechts}>
                    {m.schlusszahlung.isZero() ? (
                      minus(m.schlusszahlung)
                    ) : (
                      <MitHerleitung
                        ausrichtung="rechts"
                        wert={minus(m.schlusszahlung)}
                        herleitung={{
                          berechnung: tl.schlussFormel,
                          werte: m.kredite.filter((k) => !k.schluss.isZero()).map((k) => [kreditName.get(k.kreditId) ?? "", f.betrag(k.schluss)]),
                        }}
                        t={t}
                      />
                    )}
                  </td>
                )}
                <td className={rechts}>
                  {m.investitionen.isZero() ? (
                    minus(m.investitionen)
                  ) : (
                    <MitHerleitung
                      ausrichtung="rechts"
                      wert={minus(m.investitionen)}
                      herleitung={{
                        berechnung: tl.investitionFormel,
                        werte: m.massnahmen.map((x) => [
                          <Link key={x.id} href={`/investitionen/${x.id}`} className="underline">
                            {massnahmeName(x.id)}
                          </Link>,
                          f.betrag(x.betrag),
                        ]),
                        quelle: tl.investitionQuelle,
                      }}
                      t={t}
                    />
                  )}
                </td>
                <td className={rechts}>{positionenZelle(m, "AUSSCHUETTUNG", m.ausschuettungen, minus)}</td>
                {mitEinnahmen && <td className={rechts}>{positionenZelle(m, "EINNAHME", m.sonstigeEinnahmen, plus)}</td>}
                <td className={rechts}>{positionenZelle(m, "AUSGABE", m.sonstigeAusgaben, minus)}</td>
                <td className={`${rechts} ${m.saldo.lessThan(0) ? "text-red-700" : ""}`}>{betrag(m.saldo)}</td>
                <td className={`${rechts} font-medium`}>{anfang.summe === null ? betrag(m.kumuliert) : betrag(m.bestand!)}</td>
                {m.status && (
                  <td>
                    <Marke ton={STATUS_TON[m.status]}>{tl.status[m.status]}</Marke>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>{tl.summe}</td>
              <td className={rechts}>{plus(plan.summen.mieten)}</td>
              <td className={rechts}>{minus(plan.summen.kapitaldienst)}</td>
              {mitSchluss && <td className={rechts}>{minus(plan.summen.schlusszahlung)}</td>}
              <td className={rechts}>{minus(plan.summen.investitionen)}</td>
              <td className={rechts}>{minus(plan.summen.ausschuettungen)}</td>
              {mitEinnahmen && <td className={rechts}>{plus(plan.summen.sonstigeEinnahmen)}</td>}
              <td className={rechts}>{minus(plan.summen.sonstigeAusgaben)}</td>
              <td className={rechts}>{betrag(plan.summen.einnahmen.minus(plan.summen.ausgaben))}</td>
              <td />
              {anfang.summe !== null && <td />}
            </tr>
          </tfoot>
        </Tabelle>
        {!plan.vollstaendig && <p className="mt-2 text-xs text-amber-700">{tl.luecken}</p>}
      </Karte>

      <div className="grid gap-6 lg:grid-cols-2">
        <Karte titel={tl.kontostaende}>
          <p className="mb-3 text-sm text-slate-600">{tl.kontostaendeHinweis}</p>
          {g.kontostaende.length === 0 ? (
            <Leer>{tl.keineKontostaende}</Leer>
          ) : (
            <Tabelle>
              <thead>
                <tr>
                  <th>{tl.konto}</th>
                  <th>{tl.stichtag}</th>
                  <th className={rechts}>{tl.betrag}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {g.kontostaende.map((k) => (
                  <tr key={k.id}>
                    <td>
                      {k.konto}
                      {k.quelle && <div className="text-xs text-slate-500">{k.quelle}</div>}
                    </td>
                    <td className="whitespace-nowrap">
                      {f.datum(k.stichtag)}
                      <div>{anfangsKonten.has(k.id) ? <Marke ton="gut">{tl.imAnfangsbestand}</Marke> : <Marke>{tl.aelter}</Marke>}</div>
                    </td>
                    <td className={rechts}>{f.betrag(k.betrag)}</td>
                    <td className="text-right">
                      {schreiben && <Formular aktion={kontostandLoeschen.bind(null, g.id, k.id)} absenden={t.allgemein.loeschen} bestaetigen={tl.loeschenFrage} inline />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabelle>
          )}
          {schreiben && (
            <div className="mt-4 space-y-6 border-t border-slate-100 pt-4">
              <Formular aktion={kontostandHinzufuegen.bind(null, g.id)} absenden={tl.kontostandHinzufuegen} zuruecksetzen>
                <Felder>
                  <Feld name="konto" label={tl.konto} pflicht platzhalter="Geschäftskonto" />
                  <Feld name="stichtag" label={tl.stichtag} typ="date" pflicht wert={stichtag} />
                  <Feld name="betrag" label={tl.betrag} pflicht inputMode="decimal" />
                  <Feld name="quelle" label={tl.quelle} platzhalter={tl.quelleHinweis} />
                </Felder>
              </Formular>
              <Formular aktion={mindestliquiditaetSpeichern.bind(null, g.id)} absenden={tl.mindestSpeichern}>
                <Feld
                  name="mindestliquiditaet"
                  label={<Begriff k="Mindestliquiditaet" t={t}>{tl.mindestliquiditaet}</Begriff>}
                  wert={f.eingabe(g.mindestliquiditaet, 2)}
                  inputMode="decimal"
                  hinweis={tl.mindestHinweis}
                />
              </Formular>
            </div>
          )}
        </Karte>

        <Karte titel={tl.planpositionen}>
          <p className="mb-3 text-sm text-slate-600">{tl.planpositionenHinweis}</p>
          {g.positionen.length === 0 ? (
            <Leer>{tl.keinePositionen}</Leer>
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <Tabelle>
                <thead>
                  <tr>
                    <th>{tl.bezeichnung}</th>
                    <th className={rechts}>{tl.betrag}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {g.positionen.map((p) => (
                    <tr key={p.id} className={imPlan(p.monat) ? undefined : "text-slate-400"}>
                      <td>
                        <span className="font-medium tabular-nums">{formatMonat(p.monat)}</span> {p.bezeichnung}
                        <div className="text-xs text-slate-500">
                          {tl.arten[p.art]}
                          {p.quelle && <> · {p.quelle}</>}
                          {!imPlan(p.monat) && <> · {tl.ausserhalb}</>}
                        </div>
                      </td>
                      <td className={rechts}>{p.art === "EINNAHME" ? f.betrag(p.betrag) : `−${f.betrag(p.betrag)}`}</td>
                      <td className="text-right">
                        {schreiben && <Formular aktion={planpositionLoeschen.bind(null, g.id, p.id)} absenden={t.allgemein.loeschen} bestaetigen={tl.loeschenFrage} inline />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Tabelle>
            </div>
          )}
          {schreiben && (
            <div className="mt-4 border-t border-slate-100 pt-4">
              <Formular aktion={planpositionHinzufuegen.bind(null, g.id)} absenden={tl.positionHinzufuegen} zuruecksetzen>
                <Felder>
                  <Auswahl name="art" label={tl.art} pflicht wert="AUSSCHUETTUNG" optionen={(["AUSSCHUETTUNG", "EINNAHME", "AUSGABE"] as const).map((a) => ({ wert: a, text: tl.arten[a] }))} />
                  <Feld name="monat" label={tl.planMonat} typ="date" pflicht wert={plan.beginn} hinweis={tl.planMonatHinweis} />
                  <Feld name="bezeichnung" label={tl.bezeichnung} pflicht />
                  <Feld name="betrag" label={tl.betrag} pflicht inputMode="decimal" />
                  <Feld name="quelle" label={tl.quelle} />
                </Felder>
              </Formular>
            </div>
          )}
        </Karte>
      </div>

      <Glossar begriffe={["Liquiditaet", "Mindestliquiditaet", "Engpass", "Kapitaldienst", "Schlusszahlung", "JNKM"]} t={t} />
    </div>
  );
}

