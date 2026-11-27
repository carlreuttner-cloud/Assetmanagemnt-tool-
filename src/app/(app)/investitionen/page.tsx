import Link from "next/link";
import { Glossar, Begriff, MitHerleitung } from "@/components/herleitung";
import { Kachel, Kacheln, Karte, KnopfLink, Leer, Marke, Reiter, Seitenkopf, Tabelle, rechts } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { bereichsSicht } from "@/lib/auth/auswahl";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { erlaubt } from "@/lib/daten/portfolio";
import { auswahlOptionen, einParam, filterHref } from "@/lib/filter";
import { formatierer } from "@/lib/format";
import { dezimal } from "@/lib/geld";
import { summiereMassnahmen, werteMassnahmeAus } from "@/lib/massnahme";
import { AbweichungWert, BudgetWert, IstWert, MehrmieteWert, RenditeWert } from "./massnahme-werte";
import { AuswahlFilter, FilterZeile } from "@/components/auswahl-filter";

const STATUS_TON = { GEPLANT: "neutral", LAUFEND: "warnung", ABGESCHLOSSEN: "gut" } as const;

export default async function InvestitionenSeite({ searchParams }: PageProps<"/investitionen">) {
  const sp = await searchParams;
  const kontext = await pruefeZugriff("haeuser");
  const t = texte(kontext.mandant.sprache);
  const f = formatierer(kontext.mandant);
  const tl = t.listen;
  const tm = t.massnahmen;
  const filter = { g: einParam(sp.g), h: einParam(sp.h), kat: einParam(sp.kat) };
  const sicht = await bereichsSicht(kontext);
  const schreiben = darf(kontext.rolle, "haeuser", "schreiben");
  const hausWhere = { hausId: erlaubt(sicht.hausIds, filter.h), haus: filter.g ? { gesellschaftId: filter.g } : undefined };

  const [haeuser, massnahmenRoh, freie] = await Promise.all([
    kontext.db.haus.findMany({
      where: { id: erlaubt(sicht.hausIds), gesellschaftId: filter.g },
      orderBy: { bezeichnung: "asc" },
      select: { id: true, bezeichnung: true, gesellschaft: { select: { id: true, name: true } } },
    }),
    kontext.db.massnahme.findMany({
      where: hausWhere,
      orderBy: [{ status: "asc" }, { beginn: "desc" }],
      include: {
        haus: { select: { id: true, bezeichnung: true, gesellschaft: { select: { name: true } } } },
        einheit: { select: { bezeichnung: true } },
        kosten: { select: { betrag: true } },
      },
    }),
    kontext.db.investition.findMany({
      where: { ...hausWhere, massnahmeId: null },
      orderBy: { datum: "desc" },
      include: { haus: { select: { id: true, bezeichnung: true } }, einheit: { select: { bezeichnung: true } } },
    }),
  ]);
  const gesellschaften = [...new Map(haeuser.map((h) => [h.gesellschaft.id, h.gesellschaft])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const OHNE = "-";
  const kategorien = [...new Set([...massnahmenRoh.map((m) => m.kategorie ?? ""), ...freie.map((i) => i.kategorie ?? "")])].sort();
  const passt = (k: string | null) => !filter.kat || (k || OHNE) === filter.kat;

  const massnahmen = massnahmenRoh
    .filter((m) => passt(m.kategorie))
    .map((m) => {
      const daten = {
        status: m.status,
        budget: m.budget === null ? null : dezimal(m.budget),
        mehrmieteMonat: m.mehrmieteMonat === null ? null : dezimal(m.mehrmieteMonat),
        kosten: m.kosten.map((k) => dezimal(k.betrag)),
      };
      return { roh: m, m: { ...daten, budgetQuelle: m.budgetQuelle, mehrmieteBelegt: m.mehrmieteBelegt, mehrmieteQuelle: m.mehrmieteQuelle }, daten, a: werteMassnahmeAus(daten) };
    });
  const freiGefiltert = freie.filter((i) => passt(i.kategorie));
  const summe = summiereMassnahmen(massnahmen.map((x) => ({ m: x.daten, a: x.a })));
  const freiSumme = freiGefiltert.reduce((s, i) => s.plus(dezimal(i.betrag)), dezimal(0));

  return (
    <div className="space-y-6">
      <Seitenkopf
        titel={t.navigation.investitionen}
        beschreibung={t.seiten.investitionen}
        aktionen={schreiben && <KnopfLink href={`/investitionen/neu${filter.h ? `?h=${filter.h}` : ""}`} art="primaer">{tm.neu}</KnopfLink>}
      />
      <FilterZeile>
        {gesellschaften.length > 1 && (
          <AuswahlFilter name="g" label={tl.gesellschaft} optionen={auswahlOptionen("/investitionen", filter, "g", tl.alleGesellschaften, gesellschaften, ["h"])} />
        )}
        {haeuser.length > 1 && (
          <AuswahlFilter
            name="h"
            label={tl.haus}
            optionen={auswahlOptionen("/investitionen", filter, "h", tl.alleHaeuser, haeuser.map((h) => ({ id: h.id, name: h.bezeichnung })))}
          />
        )}
      </FilterZeile>
      {kategorien.length > 1 && (
        <Reiter
          eintraege={[
            { href: filterHref("/investitionen", filter, "kat", undefined), text: t.allgemein.alle, aktiv: !filter.kat },
            ...kategorien.map((k) => ({ href: filterHref("/investitionen", filter, "kat", k || OHNE), text: k || tl.ohneKategorie, aktiv: filter.kat === (k || OHNE) })),
          ]}
        />
      )}

      <Kacheln>
        <Kachel
          titel={tm.kachelBudget}
          wert={<MitHerleitung wert={f.betragGanz(summe.budget)} herleitung={{ berechnung: `${tm.summe} ${tm.budget}`, fehlt: summe.budgetUnbekannt ? [fuelle(tm.ohneBudget, { anzahl: summe.budgetUnbekannt })] : [] }} t={t} />}
          unter={summe.budgetUnbekannt ? fuelle(tm.ohneBudget, { anzahl: summe.budgetUnbekannt }) : undefined}
        />
        <Kachel titel={tm.kachelIst} wert={<MitHerleitung wert={f.betragGanz(summe.ist)} herleitung={{ berechnung: tm.istFormel }} t={t} />} />
        <Kachel
          titel={tm.kachelAbweichung}
          wert={summe.abweichung ? <MitHerleitung wert={`${summe.abweichung.isNegative() ? "" : "+"}${f.betragGanz(summe.abweichung)}`} herleitung={{ berechnung: tm.abweichungFormel }} t={t} /> : "–"}
          unter={fuelle(tm.vergleichbar, { anzahl: summe.vergleichbar })}
          ton={summe.abweichung && summe.abweichung.isPositive() && !summe.abweichung.isZero() ? "schlecht" : undefined}
        />
        <Kachel
          titel={<Begriff k="Mehrmiete" t={t}>{tm.kachelMehrmiete}</Begriff>}
          wert={<MitHerleitung wert={f.betragGanz(summe.mehrmieteJahr)} herleitung={{ berechnung: t.glossar.Mehrmiete.lang, fehlt: summe.mehrmieteUnbekannt ? [fuelle(tm.mehrmieteUnbekannt, { anzahl: summe.mehrmieteUnbekannt })] : [] }} t={t} />}
          unter={summe.mehrmieteUnbekannt ? fuelle(tm.mehrmieteUnbekannt, { anzahl: summe.mehrmieteUnbekannt }) : undefined}
        />
      </Kacheln>

      <Karte titel={tm.massnahmen}>
        {massnahmen.length === 0 ? (
          <Leer>{tm.keine}</Leer>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{tm.massnahme}</th>
                <th>{tm.haus}</th>
                <th>{tm.status}</th>
                <th className={rechts}>{tm.budget}</th>
                <th className={rechts}>{tm.ist}</th>
                <th className={rechts}>{tm.abweichung}</th>
                <th className={rechts}>
                  <Begriff k="Mehrmiete" t={t}>{tm.mehrmiete}</Begriff>
                </th>
                <th className={rechts}>
                  <Begriff k="RenditeMassnahme" t={t}>{tm.rendite}</Begriff> /{" "}
                  <Begriff k="Amortisation" t={t}>{tm.amortisation}</Begriff>
                </th>
              </tr>
            </thead>
            <tbody>
              {massnahmen.map(({ roh, m, a }) => {
                const p = { m, a, anzahlKosten: roh.kosten.length, t, f };
                return (
                  <tr key={roh.id} className="hover:bg-slate-50">
                    <td>
                      <Link href={`/investitionen/${roh.id}`} className="font-medium hover:underline">
                        {roh.bezeichnung}
                      </Link>
                      <div className="text-xs text-slate-500">{[roh.kategorie, roh.einheit?.bezeichnung].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td>
                      <Link href={`/haeuser/${roh.haus.id}`} className="hover:underline">
                        {roh.haus.bezeichnung}
                      </Link>
                    </td>
                    <td>
                      <Marke ton={STATUS_TON[roh.status]}>{tm.stati[roh.status]}</Marke>
                    </td>
                    <td className={rechts}><BudgetWert {...p} /></td>
                    <td className={rechts}><IstWert {...p} /></td>
                    <td className={rechts}><AbweichungWert {...p} /></td>
                    <td className={rechts}><MehrmieteWert {...p} /></td>
                    <td className={rechts}>
                      <div>
                        <div><RenditeWert {...p} art="rendite" /></div>
                        <div className="text-xs text-slate-500"><RenditeWert {...p} art="amortisation" /></div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Tabelle>
        )}
      </Karte>

      {freiGefiltert.length > 0 && (
        <Karte titel={tm.ohneMassnahme}>
          <p className="mb-3 text-sm text-amber-800">{tm.ohneMassnahmeHinweis}</p>
          <Tabelle>
            <thead>
              <tr>
                <th>{tm.datum}</th>
                <th>{tm.haus}</th>
                <th>{tm.einheit}</th>
                <th>{tm.kategorie}</th>
                <th>{tm.beschreibung}</th>
                <th className={rechts}>{tm.betrag}</th>
              </tr>
            </thead>
            <tbody>
              {freiGefiltert.map((i) => (
                <tr key={i.id}>
                  <td className="whitespace-nowrap">{f.datum(i.datum)}</td>
                  <td>
                    <Link href={`/haeuser/${i.haus.id}`} className="hover:underline">
                      {i.haus.bezeichnung}
                    </Link>
                  </td>
                  <td>{i.einheit?.bezeichnung}</td>
                  <td>{i.kategorie ?? <span className="text-slate-400">{tl.ohneKategorie}</span>}</td>
                  <td>{i.beschreibung}</td>
                  <td className={rechts}>{f.betrag(i.betrag)}</td>
                </tr>
              ))}
            </tbody>
            {freiGefiltert.length > 1 && (
              <tfoot>
                <tr>
                  <td colSpan={5}>{t.allgemein.summe} ({freiGefiltert.length})</td>
                  <td className={rechts}>{f.betrag(freiSumme)}</td>
                </tr>
              </tfoot>
            )}
          </Tabelle>
        </Karte>
      )}
      <Glossar begriffe={["Mehrmiete", "RenditeMassnahme", "Amortisation"]} t={t} />
    </div>
  );
}
