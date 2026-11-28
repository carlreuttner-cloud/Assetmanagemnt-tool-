import Link from "next/link";
import type { ReactNode } from "react";
import { Begriff, Glossar, Hinweismarke, MitHerleitung, RestschuldWert, Unbekannt } from "@/components/herleitung";
import { Kachel, Kacheln, Karte, Leer, Seitenkopf, Tabelle, knopfKlasse, rechts } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { gruppenReserve, hausReserve, krediteOhneHaus, zielLtvAus, type GruppenReserve, type HausReserve } from "@/lib/beleihung";
import { heute } from "@/lib/datum";
import { ladeRechengrundlage } from "@/lib/daten/portfolio";
import { einParam } from "@/lib/filter";
import { formatierer } from "@/lib/format";
import type { Decimal } from "@/lib/geld";

export default async function BeleihungsreserveSeite({ searchParams }: PageProps<"/beleihungsreserve">) {
  const kontext = await pruefeZugriff("gesellschaften");
  const t = texte(kontext.mandant.sprache);
  const tb = t.beleihung;
  const f = formatierer(kontext.mandant);
  const sp = await searchParams;
  const ziel = zielLtvAus(einParam(sp.ltv));
  const stichtag = heute();
  const grundlage = await ladeRechengrundlage(kontext);
  const [haeuser, gesellschaften, kreditNamen] = await Promise.all([
    kontext.db.haus.findMany({ where: { id: { in: grundlage.haeuser.map((h) => h.id) } }, orderBy: { bezeichnung: "asc" }, select: { id: true, bezeichnung: true } }),
    kontext.db.gesellschaft.findMany({ where: { id: { in: [...new Set(grundlage.haeuser.map((h) => h.gesellschaftId))] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    kontext.db.kredit.findMany({ where: { id: { in: grundlage.kredite.map((k) => k.id) } }, select: { id: true, bezeichnung: true } }),
  ]);
  const hausName = new Map(haeuser.map((h) => [h.id, h.bezeichnung]));
  const kreditName = new Map(kreditNamen.map((k) => [k.id, k.bezeichnung]));
  const reserven = grundlage.haeuser
    .map((h) => hausReserve(h, grundlage.kredite, ziel, stichtag))
    .sort((a, b) => (hausName.get(a.hausId) ?? "").localeCompare(hausName.get(b.hausId) ?? "", "de"));
  const portfolio = gruppenReserve(reserven, ziel);
  const ohneHaus = krediteOhneHaus(grundlage.kredite);
  const ltvText = f.prozent(ziel, ziel.isInteger() ? 0 : 1);

  const betrag = (w: Decimal | null, grund?: string) => (w === null ? <Unbekannt t={t} grund={grund} /> : f.betragGanz(w));
  const reserveWert = (w: Decimal | null, herleitung: Parameters<typeof MitHerleitung>[0]["herleitung"], grund?: string): ReactNode =>
    w === null ? (
      <Unbekannt t={t} grund={grund} />
    ) : (
      <span className={w.isNegative() ? "text-red-700" : "text-emerald-700"}>
        <MitHerleitung wert={f.betragGanz(w)} herleitung={herleitung} t={t} ausrichtung="rechts" />
      </span>
    );
  const lueckenText = (h: HausReserve) => h.luecken.map((l) => tb.luecken[l]).join(", ");
  const spanne = (g: GruppenReserve) => (g.stichtagVon && g.stichtagBis ? fuelle(tb.stichtage, { von: f.datum(g.stichtagVon), bis: f.datum(g.stichtagBis) }) : undefined);

  const gruppenZeile = (name: ReactNode, g: GruppenReserve, schluessel: string) => (
    <tr key={schluessel} data-reserve-gruppe={schluessel}>
      <td className="font-medium">{name}</td>
      <td className={rechts}>{g.anzahl}</td>
      <td className={rechts}>{betrag(g.verkehrswert, fuelle(tb.luecken.gruppe, { anzahl: g.anzahl - g.bekannt }))}</td>
      <td className={rechts}>{betrag(g.restschuld, fuelle(tb.luecken.gruppe, { anzahl: g.anzahl - g.bekannt }))}</td>
      <td className={rechts}>{g.ltvIst === null ? <Unbekannt t={t} /> : f.prozent(g.ltvIst, 1)}</td>
      <td className={rechts}>
        {reserveWert(
          g.reserve,
          {
            berechnung: tb.herleitungGruppe,
            werte: g.verkehrswert && g.restschuld ? [[tb.spalten.verkehrswert, f.betragGanz(g.verkehrswert)], [t.glossar.ZielLtv.kurz, ltvText], [tb.spalten.restschuld, f.betragGanz(g.restschuld)]] : [],
            stichtag: spanne(g),
          },
          fuelle(tb.luecken.gruppe, { anzahl: g.anzahl - g.bekannt }),
        )}
      </td>
      <td className={rechts}>{betrag(g.reservePositiv)}</td>
    </tr>
  );
  const gruppenKopf = (
    <thead>
      <tr>
        <th>{tb.spalten.name}</th>
        <th className={rechts}>{tb.spalten.haeuser}</th>
        <th className={rechts}>{tb.spalten.verkehrswert}</th>
        <th className={rechts}>{tb.spalten.restschuld}</th>
        <th className={rechts}>
          <Begriff k="LTV" t={t}>{tb.spalten.ltvIst}</Begriff>
        </th>
        <th className={rechts}>
          <Begriff k="Beleihungsreserve" t={t}>{tb.spalten.reserve}</Begriff>
        </th>
        <th className={rechts}>{tb.spalten.reservePositiv}</th>
      </tr>
    </thead>
  );

  return (
    <div className="max-w-7xl space-y-6">
      <Seitenkopf titel={t.navigation.beleihungsreserve} beschreibung={t.seiten.beleihungsreserve} />

      <Karte>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-slate-700">
              <Begriff k="ZielLtv" t={t}>{tb.zielLtv}</Begriff>
            </span>
            <input type="number" name="ltv" min={1} max={100} step="0.5" defaultValue={ziel.toString()} className="mt-1 w-24 rounded-md border border-slate-300 px-2 py-1" />
          </label>
          <button type="submit" className={knopfKlasse("sekundaer")}>
            {tb.berechnen}
          </button>
          <span className="text-sm text-slate-500">{fuelle(tb.stichtag, { datum: f.datum(stichtag) })}</span>
        </form>
        <p className="mt-3 text-sm text-slate-600">{tb.hinweis}</p>
        <p className="mt-1 text-sm text-slate-600">
          {tb.sicherheitenHinweis}{" "}
          <Link href="/sicherheiten" className="text-sky-700 hover:underline">
            {t.navigation.sicherheiten} →
          </Link>
        </p>
      </Karte>

      {reserven.length === 0 ? (
        <Leer>{tb.keineHaeuser}</Leer>
      ) : (
        <>
          <Kacheln>
            <Kachel
              titel={<Begriff k="Beleihungsreserve" t={t}>{tb.kacheln.reserve}</Begriff>}
              wert={portfolio.reserve === null ? <Unbekannt t={t} grund={fuelle(tb.luecken.gruppe, { anzahl: portfolio.anzahl - portfolio.bekannt })} /> : f.betragGanz(portfolio.reserve)}
              unter={fuelle(tb.reserveUnter, { ltv: ltvText })}
              ton={portfolio.reserve?.isNegative() ? "schlecht" : undefined}
            />
            <Kachel titel={tb.kacheln.reservePositiv} wert={betrag(portfolio.reservePositiv)} unter={tb.positivUnter} />
            <Kachel titel={<Begriff k="LTV" t={t}>{tb.kacheln.ltvIst}</Begriff>} wert={portfolio.ltvIst === null ? <Unbekannt t={t} /> : f.prozent(portfolio.ltvIst, 1)} unter={spanne(portfolio)} />
            <Kachel titel={tb.kacheln.vollstaendig} wert={fuelle(tb.vollstaendigWert, { bekannt: portfolio.bekannt, gesamt: portfolio.anzahl })} />
          </Kacheln>

          <Karte titel={tb.jeGesellschaft}>
            <Tabelle>
              {gruppenKopf}
              <tbody>
                {gesellschaften.map((g) =>
                  gruppenZeile(
                    <Link href={`/gesellschaften/${g.id}`} className="hover:underline">
                      {g.name}
                    </Link>,
                    gruppenReserve(
                      reserven.filter((r) => r.gesellschaftId === g.id),
                      ziel,
                    ),
                    g.id,
                  ),
                )}
                {gruppenZeile(tb.portfolio, portfolio, "portfolio")}
              </tbody>
            </Tabelle>
          </Karte>

          <Karte titel={tb.jeHaus}>
            <Tabelle>
              <thead>
                <tr>
                  <th>{tb.spalten.name}</th>
                  <th className={rechts}>{tb.spalten.verkehrswert}</th>
                  <th className={rechts}>{tb.spalten.restschuld}</th>
                  <th className={rechts}>
                    <Begriff k="LTV" t={t}>{tb.spalten.ltvIst}</Begriff>
                  </th>
                  <th className={rechts}>{tb.spalten.zielBetrag}</th>
                  <th className={rechts}>
                    <Begriff k="Beleihungsreserve" t={t}>{tb.spalten.reserve}</Begriff>
                  </th>
                </tr>
              </thead>
              <tbody>
                {reserven.map((r) => (
                  <tr key={r.hausId} data-reserve-haus={hausName.get(r.hausId)}>
                    <td>
                      <Link href={`/haeuser/${r.hausId}`} className="font-medium hover:underline">
                        {hausName.get(r.hausId)}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {r.kredite.map((k) => kreditName.get(k.kreditId)).join(", ") || "–"}
                      </div>
                      {r.nichtAusgezahlt > 0 && <Hinweismarke>{tb.nichtAusgezahlt}</Hinweismarke>}
                    </td>
                    <td className={rechts}>
                      {r.verkehrswert ? (
                        <span className="inline-flex flex-col items-end">
                          {f.betragGanz(r.verkehrswert.wert)}
                          <span className="text-xs text-slate-500">
                            {t.allgemein.stand} {f.datum(r.verkehrswert.stichtag)}
                          </span>
                        </span>
                      ) : (
                        <Unbekannt t={t} grund={tb.luecken.verkehrswert} />
                      )}
                    </td>
                    <td className={rechts}>
                      {r.kredite.length === 0 ? (
                        f.betragGanz(0)
                      ) : r.kredite.length === 1 ? (
                        <RestschuldWert nachweis={r.kredite[0].nachweis} anteilProzent={r.kredite[0].anteilProzent.equals(100) ? undefined : r.kredite[0].anteilProzent} t={t} f={f} ganz />
                      ) : (
                        <MitHerleitung
                          wert={betrag(r.restschuld, tb.luecken.restschuld)}
                          herleitung={{
                            werte: r.kredite.map((k) => [
                              kreditName.get(k.kreditId),
                              k.betrag === null
                                ? t.allgemein.unbekannt
                                : `${f.betragGanz(k.betrag)} (${f.prozent(k.anteilProzent, 0)}${k.nachweis && k.nachweis.herkunft !== "nichtAusgezahlt" ? `, ${t.allgemein.stand} ${f.datum(k.nachweis.stichtag)}` : ""})`,
                            ]),
                          }}
                          t={t}
                          ausrichtung="rechts"
                        />
                      )}
                    </td>
                    <td className={rechts}>{r.ltvIst === null ? <Unbekannt t={t} /> : f.prozent(r.ltvIst, 1)}</td>
                    <td className={rechts}>{betrag(r.zielBetrag, tb.luecken.verkehrswert)}</td>
                    <td className={rechts}>
                      {reserveWert(
                        r.reserve,
                        {
                          berechnung: tb.herleitung,
                          werte: r.verkehrswert && r.restschuld !== null ? [[tb.spalten.verkehrswert, f.betragGanz(r.verkehrswert.wert)], [t.glossar.ZielLtv.kurz, ltvText], [tb.spalten.restschuld, f.betragGanz(r.restschuld)]] : [],
                          stichtag: r.verkehrswert ? f.datum(r.verkehrswert.stichtag) : undefined,
                          hinweis: r.reserve?.isNegative() ? tb.ueberschritten : undefined,
                        },
                        lueckenText(r),
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabelle>
            {ohneHaus.length > 0 && <p className="mt-3 text-sm text-amber-700">{fuelle(tb.ohneHaus, { namen: ohneHaus.map((k) => kreditName.get(k.id)).join(", ") })}</p>}
          </Karte>
        </>
      )}

      <Glossar begriffe={["Beleihungsreserve", "ZielLtv", "LTV"]} t={t} />
    </div>
  );
}
