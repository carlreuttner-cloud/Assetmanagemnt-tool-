import Link from "next/link";
import type { ReactNode } from "react";
import { Begriff, Glossar, MitHerleitung, Unbekannt } from "@/components/herleitung";
import { Kachel, Kacheln, Karte, Leer, Seitenkopf, Tabelle, rechts } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { bereichsSicht } from "@/lib/auth/auswahl";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { idFilter } from "@/lib/auth/sichtbarkeit";
import { heute, isoDatum } from "@/lib/datum";
import { formatierer } from "@/lib/format";
import { dezimal } from "@/lib/geld";
import type { Bewegung } from "@/lib/kapitalkonto";
import { rendite, type Rendite } from "@/lib/rendite";

export default async function RenditenSeite() {
  const kontext = await pruefeZugriff("gesellschaften");
  const t = texte(kontext.mandant.sprache);
  const tr = t.renditen;
  const f = formatierer(kontext.mandant);
  const stichtag = heute();
  const vorjahr = Number(stichtag.slice(0, 4)) - 1;
  const sicht = await bereichsSicht(kontext);
  const gesellschaften = (
    await kontext.db.gesellschaft.findMany({
      where: { id: idFilter(sicht.gesellschaftIds) },
      orderBy: { name: "asc" },
      select: { id: true, name: true, gesellschafter: { orderBy: { name: "asc" }, select: { id: true, name: true, bewegungen: { select: { art: true, datum: true, betrag: true } } } } },
    })
  )
    .filter((g) => g.gesellschafter.length > 0)
    .map((g) => ({
      ...g,
      gesellschafter: g.gesellschafter.map((gs) => ({ id: gs.id, name: gs.name, bewegungen: gs.bewegungen.map((b): Bewegung => ({ art: b.art, datum: isoDatum(b.datum), betrag: dezimal(b.betrag) })) })),
    }));

  const alle = gesellschaften.flatMap((g) => g.gesellschafter.flatMap((gs) => gs.bewegungen));
  const portfolio = rendite(alle, stichtag);
  const investoren = new Map<string, { bewegungen: Bewegung[]; gesellschaften: string[] }>();
  for (const g of gesellschaften)
    for (const gs of g.gesellschafter) {
      const i = investoren.get(gs.name) ?? { bewegungen: [], gesellschaften: [] };
      i.bewegungen.push(...gs.bewegungen);
      i.gesellschaften.push(g.name);
      investoren.set(gs.name, i);
    }

  const zeitraum = (r: Rendite) => (r.ersteZahlung && r.letzteZahlung ? fuelle(tr.zeitraum, { von: f.datum(r.ersteZahlung), bis: f.datum(r.letzteZahlung), anzahl: r.anzahl }) : undefined);
  const fehlt = (r: Rendite) => (r.ohneDatum > 0 ? [fuelle(tr.ohneDatum, { anzahl: r.ohneDatum })] : undefined);
  const irrWert = (r: Rendite): ReactNode =>
    r.irr === null ? (
      <Unbekannt t={t} grund={tr.irrGruende[r.irrGrund!]} />
    ) : (
      <MitHerleitung
        wert={<span className={r.irr.isNegative() ? "text-red-700" : undefined}>{f.prozent(r.irr, 2)}</span>}
        herleitung={{ berechnung: tr.herleitungIrr, werte: [[tr.spalten.einlagen, f.betragGanz(r.einlagen)], [tr.spalten.rueckfluesse, f.betragGanz(r.rueckfluesse)]], stichtag: zeitraum(r), fehlt: fehlt(r) }}
        t={t}
        ausrichtung="rechts"
      />
    );
  const multipleWert = (r: Rendite): ReactNode =>
    r.multiple === null ? (
      <Unbekannt t={t} />
    ) : (
      <MitHerleitung
        wert={`${f.faktor(r.multiple, 2)}×`}
        herleitung={{ berechnung: tr.herleitungMultiple, werte: [[tr.rueckzahlungen, f.betragGanz(r.rueckzahlungen)], [tr.ausschuettungen, f.betragGanz(r.ausschuettungen)], [tr.spalten.einlagen, f.betragGanz(r.einlagen)]], fehlt: fehlt(r) }}
        t={t}
        ausrichtung="rechts"
      />
    );
  const cocWert = (r: Rendite): ReactNode => {
    const j = r.cashOnCash.find((c) => c.jahr === vorjahr);
    if (!j || j.quote === null) return <Unbekannt t={t} />;
    return (
      <MitHerleitung
        wert={f.prozent(j.quote, 1)}
        herleitung={{ berechnung: tr.herleitungCoc, werte: r.cashOnCash.map((c) => [String(c.jahr), c.quote === null ? t.allgemein.unbekannt : `${f.prozent(c.quote, 1)} (${f.betragGanz(c.ausschuettungen)} ÷ ${f.betragGanz(c.kapital)})`]), fehlt: fehlt(r) }}
        t={t}
        ausrichtung="rechts"
      />
    );
  };
  const kopf = (erste: ReactNode) => (
    <thead>
      <tr>
        <th>{erste}</th>
        <th className={rechts}>{tr.spalten.einlagen}</th>
        <th className={rechts}>{tr.spalten.rueckfluesse}</th>
        <th className={rechts}>
          <Begriff k="EkMultiple" t={t}>{tr.spalten.multiple}</Begriff>
        </th>
        <th className={rechts}>
          <Begriff k="IRR" t={t}>{tr.spalten.irr}</Begriff>
        </th>
        <th className={rechts}>
          <Begriff k="CashOnCash" t={t}>{fuelle(tr.spalten.coc, { jahr: vorjahr })}</Begriff>
        </th>
      </tr>
    </thead>
  );
  const zeile = (name: ReactNode, r: Rendite, schluessel: string, attr: Record<string, string>, fett = false) => (
    <tr key={schluessel} {...attr} className={fett ? "font-semibold" : undefined}>
      <td>
        {name}
        {(zeitraum(r) || r.ohneDatum > 0) && (
          <div className="text-xs font-normal text-slate-500">
            {zeitraum(r)}
            {r.ohneDatum > 0 && <span className="text-amber-700"> · {fuelle(tr.ohneDatum, { anzahl: r.ohneDatum })}</span>}
          </div>
        )}
      </td>
      <td className={rechts}>{f.betragGanz(r.einlagen)}</td>
      <td className={rechts}>{f.betragGanz(r.rueckfluesse)}</td>
      <td className={rechts}>{multipleWert(r)}</td>
      <td className={rechts}>{irrWert(r)}</td>
      <td className={rechts}>{cocWert(r)}</td>
    </tr>
  );

  return (
    <div className="max-w-7xl space-y-6">
      <Seitenkopf titel={t.navigation.renditen} beschreibung={t.seiten.renditen} />
      <p className="text-sm text-slate-600">{tr.hinweis}</p>
      {gesellschaften.length === 0 ? (
        <Leer>{tr.keine}</Leer>
      ) : (
        <>
          <Kacheln>
            <Kachel titel={<Begriff k="IRR" t={t}>{tr.kacheln.irr}</Begriff>} wert={irrWert(portfolio)} unter={tr.ohneRestwert} />
            <Kachel titel={<Begriff k="EkMultiple" t={t}>{tr.kacheln.multiple}</Begriff>} wert={multipleWert(portfolio)} unter={portfolio.ohneDatum > 0 ? fuelle(tr.ohneDatum, { anzahl: portfolio.ohneDatum }) : undefined} ton={portfolio.ohneDatum > 0 ? "warnung" : undefined} />
            <Kachel titel={tr.kacheln.einlagen} wert={f.betragGanz(portfolio.einlagen)} />
            <Kachel titel={tr.kacheln.rueckfluesse} wert={f.betragGanz(portfolio.rueckfluesse)} unter={`${tr.rueckzahlungen} ${f.betragGanz(portfolio.rueckzahlungen)} · ${tr.ausschuettungen} ${f.betragGanz(portfolio.ausschuettungen)}`} />
          </Kacheln>

          <Karte titel={tr.jeGesellschaft}>
            <Tabelle>
              {kopf(tr.spalten.name)}
              <tbody>
                {gesellschaften.flatMap((g) => [
                  zeile(
                    <Link href={`/gesellschaften/${g.id}/gesellschafter`} className="hover:underline">
                      {g.name}
                    </Link>,
                    rendite(g.gesellschafter.flatMap((gs) => gs.bewegungen), stichtag),
                    g.id,
                    { "data-rendite-gesellschaft": g.name },
                    true,
                  ),
                  ...g.gesellschafter.map((gs) => zeile(<span className="pl-4">{gs.name}</span>, rendite(gs.bewegungen, stichtag), gs.id, { "data-rendite-gesellschafter": gs.name })),
                ])}
              </tbody>
            </Tabelle>
          </Karte>

          <Karte titel={tr.jeInvestor}>
            <p className="-mt-2 mb-3 text-xs text-slate-500">{tr.jeInvestorHinweis}</p>
            <Tabelle>
              {kopf(tr.spalten.name)}
              <tbody>
                {[...investoren.entries()]
                  .sort(([a], [b]) => a.localeCompare(b, "de"))
                  .map(([name, i]) =>
                    zeile(
                      <>
                        {name}
                        <div className="text-xs font-normal text-slate-500">{i.gesellschaften.join(", ")}</div>
                      </>,
                      rendite(i.bewegungen, stichtag),
                      name,
                      { "data-rendite-investor": name },
                    ),
                  )}
              </tbody>
            </Tabelle>
          </Karte>
        </>
      )}
      <Glossar begriffe={["IRR", "EkMultiple", "CashOnCash", "Kapitalsaldo"]} t={t} />
    </div>
  );
}
