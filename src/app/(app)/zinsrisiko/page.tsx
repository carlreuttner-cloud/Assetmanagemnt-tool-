import Link from "next/link";
import type { ReactNode } from "react";
import { Balkendiagramm } from "@/components/diagramme";
import { Begriff, Glossar, MitHerleitung, RestschuldWert, Unbekannt } from "@/components/herleitung";
import { Kachel, Kacheln, Karte, Leer, Marke, Seitenkopf, Tabelle, knopfKlasse, rechts } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { heute } from "@/lib/datum";
import { ladeRechengrundlage } from "@/lib/daten/portfolio";
import { DIAGRAMM_FARBEN } from "@/lib/farben";
import { einParam } from "@/lib/filter";
import { formatierer } from "@/lib/format";
import type { Decimal } from "@/lib/geld";
import { SCHOCK_MAX, gruppenRisiko, kreditRisiko, schockAus, type GruppenRisiko, type Gewichtet, type KreditRisiko } from "@/lib/zinsrisiko";

const ANTEILE = ["fest", "abgesichert", "variabel"] as const;

export default async function ZinsrisikoSeite({ searchParams }: PageProps<"/zinsrisiko">) {
  const kontext = await pruefeZugriff("gesellschaften");
  const t = texte(kontext.mandant.sprache);
  const tz = t.zinsrisiko;
  const f = formatierer(kontext.mandant);
  const sp = await searchParams;
  const bp = schockAus(einParam(sp.bp));
  const stichtag = heute();
  const grundlage = await ladeRechengrundlage(kontext);
  const risiken = grundlage.kredite.map((k) => kreditRisiko(k, grundlage.referenzwerte, stichtag, bp)).filter((r): r is KreditRisiko => r !== null);
  const [kredite, gesellschaften] = await Promise.all([
    kontext.db.kredit.findMany({ where: { id: { in: risiken.map((r) => r.kreditId) } }, orderBy: { bezeichnung: "asc" }, select: { id: true, bezeichnung: true, bank: true } }),
    kontext.db.gesellschaft.findMany({ where: { id: { in: [...new Set(risiken.map((r) => r.gesellschaftId))] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const kreditInfo = new Map(kredite.map((k) => [k.id, k]));
  const gesellschaftName = new Map(gesellschaften.map((g) => [g.id, g.name]));
  risiken.sort((a, b) => (gesellschaftName.get(a.gesellschaftId) ?? "").localeCompare(gesellschaftName.get(b.gesellschaftId) ?? "", "de") || (kreditInfo.get(a.kreditId)?.bezeichnung ?? "").localeCompare(kreditInfo.get(b.kreditId)?.bezeichnung ?? "", "de"));
  const portfolio = gruppenRisiko(risiken);
  const ohneBeleg = risiken.filter((r) => r.restschuld === null);
  const bpText = `+${bp} bp`;

  const spanne = (g: GruppenRisiko) =>
    g.stichtagVon && g.stichtagBis ? (g.stichtagVon === g.stichtagBis ? f.datum(g.stichtagVon) : `${f.datum(g.stichtagVon)} – ${f.datum(g.stichtagBis)}`) : undefined;
  const teilweise = (w: Gewichtet) => (w.fehlend > 0 ? fuelle(tz.teilweise, { anzahl: w.fehlend }) : undefined);
  const gewichtetWert = (w: Gewichtet, text: (d: Decimal) => string, berechnung: string, g: GruppenRisiko): ReactNode =>
    w.wert === null ? (
      <Unbekannt t={t} grund={teilweise(w)} />
    ) : (
      <MitHerleitung
        wert={text(w.wert)}
        herleitung={{ berechnung, werte: [[tz.spalten.kredite, String(w.bekannt)], [tz.spalten.restschuld, f.betragGanz(g.restschuld)]], stichtag: spanne(g), fehlt: w.fehlend > 0 ? [fuelle(tz.teilweise, { anzahl: w.fehlend })] : undefined }}
        t={t}
        ausrichtung="rechts"
      />
    );
  const jahre = (d: Decimal) => f.zahl(d, 1);
  const prozent = (g: GruppenRisiko, a: (typeof ANTEILE)[number]) => (g.anteileProzent ? f.prozent(g.anteileProzent[a], 0) : "–");
  const mehrkostenWert = (g: GruppenRisiko): ReactNode => (
    <MitHerleitung
      wert={<span className={g.mehrkosten.greaterThan(0) ? "text-red-700" : undefined}>{f.betragGanz(g.mehrkosten)}</span>}
      herleitung={{ berechnung: tz.herleitungMehrkosten, werte: [[tz.spalten.restschuld, f.betragGanz(g.restschuld)], [t.glossar.Zinsschock.kurz, bpText]], fehlt: g.mehrkostenFehlend > 0 ? [fuelle(tz.teilweise, { anzahl: g.mehrkostenFehlend })] : undefined, stichtag: spanne(g) }}
      t={t}
      ausrichtung="rechts"
    />
  );

  const gruppenZeile = (name: ReactNode, g: GruppenRisiko, schluessel: string) => (
    <tr key={schluessel} data-risiko-gruppe={schluessel}>
      <td className="font-medium">{name}</td>
      <td className={rechts}>{g.anzahl}</td>
      <td className={rechts}>
        {f.betragGanz(g.restschuld)}
        {g.ohneBeleg > 0 && <div className="text-xs text-amber-700">{fuelle(t.refinanzierung.unvollstaendig, { anzahl: g.ohneBeleg })}</div>}
      </td>
      <td className={rechts}>{gewichtetWert(g.durchschnittszins, (d) => f.prozent(d, 2), tz.herleitungDurchschnitt, g)}</td>
      <td className={rechts}>{gewichtetWert(g.bindungJahre, jahre, tz.herleitungBindung, g)}</td>
      {ANTEILE.map((a) => (
        <td key={a} className={rechts}>
          {prozent(g, a)}
        </td>
      ))}
      <td className={rechts}>{mehrkostenWert(g)}</td>
    </tr>
  );

  return (
    <div className="max-w-7xl space-y-6">
      <Seitenkopf titel={t.navigation.zinsrisiko} beschreibung={t.seiten.zinsrisiko} />

      <Karte>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-slate-700">
              <Begriff k="Basispunkt" t={t}>{tz.schock}</Begriff>
            </span>
            <input type="number" name="bp" min={1} max={SCHOCK_MAX} step={1} defaultValue={bp} className="mt-1 w-24 rounded-md border border-slate-300 px-2 py-1" />
          </label>
          <button type="submit" className={knopfKlasse("sekundaer")}>
            {tz.berechnen}
          </button>
          <span className="text-sm text-slate-500">{fuelle(tz.stichtag, { datum: f.datum(stichtag) })}</span>
        </form>
        <p className="mt-3 text-sm text-slate-600">{tz.hinweis}</p>
      </Karte>

      {risiken.length === 0 ? (
        <Leer>{tz.keineKredite}</Leer>
      ) : (
        <>
          <Kacheln>
            <Kachel titel={<Begriff k="Durchschnittszins" t={t}>{tz.kacheln.durchschnitt}</Begriff>} wert={gewichtetWert(portfolio.durchschnittszins, (d) => f.prozent(d, 2), tz.herleitungDurchschnitt, portfolio)} unter={teilweise(portfolio.durchschnittszins)} />
            <Kachel titel={<Begriff k="ZinsbindungRest" t={t}>{tz.kacheln.bindung}</Begriff>} wert={gewichtetWert(portfolio.bindungJahre, (d) => fuelle(tz.jahreWert, { jahre: jahre(d) }), tz.herleitungBindung, portfolio)} unter={teilweise(portfolio.bindungJahre)} />
            <Kachel titel={tz.kacheln.fest} wert={prozent(portfolio, "fest")} unter={fuelle(tz.anteileUnter, { abgesichert: prozent(portfolio, "abgesichert"), variabel: prozent(portfolio, "variabel") })} />
            <Kachel
              titel={<Begriff k="Zinsschock" t={t}>{tz.kacheln.mehrkosten}</Begriff>}
              wert={mehrkostenWert(portfolio)}
              unter={portfolio.mehrkostenFehlend > 0 ? `${fuelle(tz.mehrkostenUnter, { bp })} · ${fuelle(tz.teilweise, { anzahl: portfolio.mehrkostenFehlend })}` : fuelle(tz.mehrkostenUnter, { bp })}
              ton={portfolio.mehrkosten.greaterThan(0) ? "warnung" : undefined}
            />
          </Kacheln>
          {ohneBeleg.length > 0 && <p className="text-sm text-amber-700">{fuelle(tz.ohneBeleg, { anzahl: ohneBeleg.length, namen: ohneBeleg.map((r) => kreditInfo.get(r.kreditId)?.bezeichnung).join(", ") })}</p>}

          <Karte titel={tz.anteileTitel}>
            <Balkendiagramm
              balken={ANTEILE.map((a, i) => ({ name: tz.anteile[a], wert: portfolio.anteile[a], farbe: DIAGRAMM_FARBEN[i], zusatz: prozent(portfolio, a) }))}
              format={(w) => f.betragGanz(w)}
            />
          </Karte>

          <Karte titel={tz.jeGesellschaft}>
            <Tabelle>
              <thead>
                <tr>
                  <th>{tz.spalten.name}</th>
                  <th className={rechts}>{tz.spalten.kredite}</th>
                  <th className={rechts}>{tz.spalten.restschuld}</th>
                  <th className={rechts}>
                    <Begriff k="Durchschnittszins" t={t}>{tz.spalten.durchschnitt}</Begriff>
                  </th>
                  <th className={rechts}>
                    <Begriff k="ZinsbindungRest" t={t}>{tz.spalten.bindung}</Begriff>
                  </th>
                  <th className={rechts}>{tz.spalten.fest}</th>
                  <th className={rechts}>{tz.spalten.abgesichert}</th>
                  <th className={rechts}>{tz.spalten.variabel}</th>
                  <th className={rechts}>
                    {tz.spalten.mehrkosten} ({bpText})
                  </th>
                </tr>
              </thead>
              <tbody>
                {gesellschaften.map((g) =>
                  gruppenZeile(
                    <Link href={`/gesellschaften/${g.id}`} className="hover:underline">
                      {g.name}
                    </Link>,
                    gruppenRisiko(risiken.filter((r) => r.gesellschaftId === g.id)),
                    g.id,
                  ),
                )}
                {gruppenZeile(tz.portfolio, portfolio, "portfolio")}
              </tbody>
            </Tabelle>
          </Karte>

          <Karte titel={tz.jeKredit}>
            <Tabelle>
              <thead>
                <tr>
                  <th>{tz.spalten.name}</th>
                  <th>{tz.spalten.art}</th>
                  <th className={rechts}>{tz.spalten.restschuld}</th>
                  <th className={rechts}>{tz.spalten.satz}</th>
                  <th className={rechts}>{tz.spalten.bindung}</th>
                  <th className={rechts}>{tz.spalten.abgesichert}</th>
                  <th className={rechts}>{tz.spalten.anstieg}</th>
                  <th className={rechts}>
                    {tz.spalten.mehrkosten} ({bpText})
                  </th>
                </tr>
              </thead>
              <tbody>
                {risiken.map((r) => {
                  const k = kreditInfo.get(r.kreditId);
                  const lueckeText = r.luecken.map((l) => tz.luecken[l]).join(", ");
                  return (
                    <tr key={r.kreditId} data-risiko-kredit={k?.bezeichnung}>
                      <td>
                        <Link href={`/gesellschaften/kredite/${r.kreditId}`} className="font-medium hover:underline">
                          {k?.bezeichnung}
                        </Link>
                        <div className="text-xs text-slate-500">
                          {gesellschaftName.get(r.gesellschaftId)}
                          {k?.bank ? ` · ${k.bank}` : ""}
                        </div>
                      </td>
                      <td>
                        <Marke ton={r.kategorie === "fest" ? "gut" : r.kategorie === "festAbgelaufen" ? "schlecht" : "warnung"}>{tz.kategorien[r.kategorie]}</Marke>
                      </td>
                      <td className={rechts}>
                        <RestschuldWert nachweis={r.nachweis} t={t} f={f} ganz />
                      </td>
                      <td className={rechts}>{r.satz === null ? <Unbekannt t={t} grund={lueckeText} /> : f.prozent(r.satz, 3)}</td>
                      <td className={rechts}>{r.bindungMonate === null ? <Unbekannt t={t} grund={lueckeText} /> : jahre(r.bindungMonate.dividedBy(12))}</td>
                      <td className={rechts}>{r.anteile && r.restschuld ? f.prozent(r.anteile.abgesichert.dividedBy(r.restschuld).times(100), 0) : "–"}</td>
                      <td className={rechts}>
                        {r.anstieg === null ? (
                          <Unbekannt t={t} grund={lueckeText} />
                        ) : (
                          <MitHerleitung wert={f.prozent(r.anstieg, 2)} herleitung={{ berechnung: tz.herleitungAnstieg, werte: [[t.glossar.Zinsschock.kurz, bpText]] }} t={t} ausrichtung="rechts" />
                        )}
                      </td>
                      <td className={rechts}>
                        {r.mehrkosten === null ? (
                          <Unbekannt t={t} grund={lueckeText} />
                        ) : (
                          <MitHerleitung
                            wert={f.betragGanz(r.mehrkosten)}
                            herleitung={{ berechnung: tz.herleitungMehrkosten, werte: [[tz.spalten.restschuld, f.betragGanz(r.restschuld!)], [tz.spalten.anstieg, f.prozent(r.anstieg!, 3)]], stichtag: r.nachweis ? f.datum(r.nachweis.stichtag) : undefined }}
                            t={t}
                            ausrichtung="rechts"
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Tabelle>
          </Karte>
        </>
      )}

      <Glossar begriffe={["Durchschnittszins", "ZinsbindungRest", "Zinsschock", "Basispunkt", "Swap", "Cap", "Zinsbindung"]} t={t} />
    </div>
  );
}
