import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Wasserfall, type WasserfallSchritt } from "@/components/diagramme";
import { Begriff, Glossar, MitHerleitung, Unbekannt } from "@/components/herleitung";
import { Karte, KnopfLink, Leer, Seitenkopf, Tabelle, rechts } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { heute, istIsoDatum, isoDatum, type IsoDatum } from "@/lib/datum";
import { erlaubt, ladeRechengrundlage } from "@/lib/daten/portfolio";
import { formatierer } from "@/lib/format";
import { dezimal, parseBetrag, type Decimal } from "@/lib/geld";
import { restschuldNachweis } from "@/lib/kredit";
import { rechneWaterfall, type WaterfallErgebnis } from "@/lib/waterfall";

type Suche = Record<string, string | string[] | undefined>;
const einzeln = (sp: Suche, k: string) => {
  const w = sp[k];
  return (Array.isArray(w) ? w[0] : w)?.trim() ?? "";
};

export default async function WaterfallSeite({ params, searchParams }: PageProps<"/gesellschaften/[id]/waterfall">) {
  const { id } = await params;
  const sp = (await searchParams) as Suche;
  const kontext = await pruefeZugriff("gesellschaften");
  const t = texte(kontext.mandant.sprache);
  const f = formatierer(kontext.mandant);
  const tw = t.waterfall;
  const sprache = kontext.mandant.sprache;
  const grundlage = await ladeRechengrundlage(kontext, { gesellschaftId: id });
  const g = await kontext.db.gesellschaft.findFirst({
    where: { id: erlaubt(grundlage.sicht.gesellschaftIds, id) },
    select: {
      id: true,
      name: true,
      waterfallvertrag: true,
      haeuser: {
        where: { id: erlaubt(grundlage.sicht.hausIds) },
        orderBy: { bezeichnung: "asc" },
        select: { id: true, bezeichnung: true, verkehrswerte: { orderBy: { stichtag: "desc" }, select: { stichtag: true, wert: true, quelle: true } } },
      },
      gesellschafter: { orderBy: { name: "asc" }, include: { bewegungen: true } },
    },
  });
  if (!g) notFound();

  // Eingaben aus der Adresse lesen; ungültige Zahlen bleiben leer (= Lücke) und werden gemeldet.
  const fehler: string[] = [];
  const zahl = (k: string, feld: string): Decimal | null => {
    const roh = einzeln(sp, k);
    if (!roh) return null;
    try {
      return parseBetrag(roh.replace("%", ""), sprache);
    } catch {
      fehler.push(fuelle(t.fehler.zahl, { feld }));
      return null;
    }
  };
  const datumRoh = einzeln(sp, "datum");
  const datum: IsoDatum = istIsoDatum(datumRoh) ? datumRoh : heute();
  const abgeschickt = einzeln(sp, "r") === "1";
  const gewaehlt = new Set(abgeschickt ? ([] as string[]).concat(sp.haus ?? []) : g.haeuser.map((h) => h.id));
  const stichtagSaldo = datum < heute() ? datum : heute();

  const verkaeufe = g.haeuser
    .filter((h) => gewaehlt.has(h.id))
    .map((h) => {
      const eingabe = zahl(`preis_${h.id}`, `${tw.preis} ${h.bezeichnung}`);
      const vw = h.verkehrswerte.find((v) => isoDatum(v.stichtag) <= datum) ?? null;
      return {
        hausId: h.id,
        name: h.bezeichnung,
        preis: eingabe ?? (vw ? dezimal(vw.wert) : null),
        preisAnnahme: eingabe === null && vw !== null,
        annahmeText: vw ? fuelle(tw.preisAnnahme, { datum: f.datum(vw.stichtag), quelle: vw.quelle ?? "–" }) : null,
      };
    });
  const kreditDaten = grundlage.kredite
    .filter((k) => k.gesellschaftId === id)
    .map((k) => ({ k, anteil: k.haeuser.filter((h) => gewaehlt.has(h.hausId)).reduce((s, h) => s.plus(h.anteilProzent), dezimal(0)) }))
    .filter((x) => x.anteil.greaterThan(0));
  const kredite = kreditDaten.map(({ k, anteil }) => {
    const n = restschuldNachweis(k, stichtagSaldo);
    return {
      id: k.id,
      name: k.bezeichnung,
      anteilProzent: anteil,
      restschuld: n?.betrag ?? null,
      restschuldStichtag: n?.stichtag ?? null,
      vorfaelligkeit: zahl(`vfe_${k.id}`, `${tw.vorfaelligkeit} ${k.bezeichnung}`),
    };
  });
  const v = g.waterfallvertrag;
  const e = rechneWaterfall({
    datum,
    verkaeufe,
    verkaufskostenProzent: zahl("kosten", tw.verkaufskosten),
    kredite,
    steuern: zahl("steuern", tw.steuern),
    gesellschafter: g.gesellschafter.map((gs) => ({
      id: gs.id,
      name: gs.name,
      gewinnanteilProzent: gs.gewinnanteilProzent === null ? null : dezimal(gs.gewinnanteilProzent),
      bewegungen: gs.bewegungen.map((b) => ({ art: b.art, datum: isoDatum(b.datum), betrag: dezimal(b.betrag) })),
    })),
    vertrag: v ? { vorzugsrenditeProzent: dezimal(v.vorzugsrenditeProzent), verzinsung: v.verzinsung, ausschuettungenAnrechnen: v.ausschuettungenAnrechnen } : null,
  });

  const stufen: Array<{ k: keyof typeof tw.stufen; wert: Decimal | null; art: WasserfallSchritt["art"] }> = [
    { k: "verkaufspreis", wert: e.verkaufspreis, art: "start" },
    { k: "verkaufskosten", wert: e.verkaufskosten, art: "abzug" },
    { k: "kreditabloesung", wert: e.kreditabloesung, art: "abzug" },
    { k: "vorfaelligkeit", wert: e.vorfaelligkeit, art: "abzug" },
    { k: "steuern", wert: e.steuern, art: "abzug" },
    { k: "nettoErloes", wert: e.nettoErloes, art: "summe" },
    { k: "rueckzahlung", wert: e.stufen.rueckzahlung, art: "verteilung" },
    { k: "vorzugsrendite", wert: e.stufen.vorzugsrendite, art: "verteilung" },
    { k: "gewinn", wert: e.stufen.gewinn, art: "verteilung" },
  ];
  const zeige = (w: Decimal | null) => (w === null ? <Unbekannt t={t} /> : f.betragGanz(w));
  const eingabeKlasse = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm";

  return (
    <div className="space-y-6">
      <Seitenkopf
        titel={<Begriff k="Waterfall" t={t}>{tw.titel}</Begriff>}
        beschreibung={`${g.name} · ${tw.beschreibung}`}
        zurueck={{ href: `/gesellschaften/${id}`, text: g.name }}
        aktionen={<KnopfLink href={`/gesellschaften/${id}/gesellschafter`}>{tw.gesellschafterVerwalten}</KnopfLink>}
      />

      {g.haeuser.length === 0 ? (
        <Karte>
          <Leer>{tw.keineHaeuser}</Leer>
        </Karte>
      ) : (
        <Karte titel={tw.eingaben}>
          <p className="mb-4 text-xs text-slate-500">{tw.eingabenHinweis}</p>
          <form method="get" className="space-y-5">
            <input type="hidden" name="r" value="1" />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <label className="block text-sm">
                <span className="font-medium text-slate-700">{tw.verkaufsdatum}</span>
                <input type="date" name="datum" defaultValue={datum} className={eingabeKlasse} />
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">{tw.verkaufskosten}</span>
                <input name="kosten" defaultValue={einzeln(sp, "kosten")} inputMode="decimal" className={eingabeKlasse} />
                <span className="mt-1 block text-xs text-slate-500">{tw.verkaufskostenHinweis}</span>
              </label>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">{tw.steuern}</span>
                <input name="steuern" defaultValue={einzeln(sp, "steuern")} inputMode="decimal" className={eingabeKlasse} />
                <span className="mt-1 block text-xs text-slate-500">{tw.steuernHinweis}</span>
              </label>
            </div>
            <fieldset>
              <legend className="text-sm font-semibold text-slate-800">{tw.haeuser}</legend>
              <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
                {g.haeuser.map((h) => {
                  const vw = h.verkehrswerte.find((x) => isoDatum(x.stichtag) <= datum);
                  return (
                    <div key={h.id} className="flex items-end gap-3 rounded-lg border border-slate-200 p-3">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" name="haus" value={h.id} defaultChecked={gewaehlt.has(h.id)} className="h-4 w-4" />
                        <span className="font-medium">{h.bezeichnung}</span>
                      </label>
                      <label className="ml-auto block w-48 text-xs">
                        <span className="text-slate-500">{tw.preis}</span>
                        <input
                          name={`preis_${h.id}`}
                          defaultValue={einzeln(sp, `preis_${h.id}`)}
                          placeholder={vw ? f.betragGanz(vw.wert) : tw.ohneVerkehrswert}
                          inputMode="decimal"
                          className={eingabeKlasse}
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
            </fieldset>
            {kreditDaten.length > 0 && (
              <fieldset>
                <legend className="text-sm font-semibold text-slate-800">
                  <Begriff k="Vorfaelligkeit" t={t}>{tw.vorfaelligkeit}</Begriff>
                </legend>
                <p className="text-xs text-slate-500">{tw.vorfaelligkeitHinweis}</p>
                <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {kreditDaten.map(({ k }) => (
                    <label key={k.id} className="block text-sm">
                      <span className="font-medium text-slate-700">{k.bezeichnung}</span>
                      <span className="ml-1 text-xs text-slate-500">
                        ({t.zinsArten[k.zinsArt]}
                        {k.zinsbindungBis ? `, ${t.kredite.zinsbindung} ${f.datum(k.zinsbindungBis)}` : ""})
                      </span>
                      <input name={`vfe_${k.id}`} defaultValue={einzeln(sp, `vfe_${k.id}`)} inputMode="decimal" className={eingabeKlasse} />
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            {fehler.length > 0 && <p className="text-sm text-red-700">{fehler.join(" ")}</p>}
            <button type="submit" className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">
              {tw.rechnen}
            </button>
          </form>
        </Karte>
      )}

      <Luecken e={e} t={t} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Karte titel={tw.diagramm}>
          <Wasserfall
            schritte={stufen.map((s) => ({ name: tw.stufenKurz[s.k], titel: tw.stufen[s.k], wert: s.wert, art: s.art }))}
            format={(w) => f.betragGanz(w)}
            formatKurz={(w) => f.betragKurz(w)}
            unbekannt={t.allgemein.unbekannt}
          />
          {e.nettoErloes?.isNegative() && <p className="mt-2 text-sm text-red-700">{tw.negativ}</p>}
          {e.unterdeckung && !e.nettoErloes?.isNegative() && <p className="mt-2 text-sm text-amber-700">{tw.unterdeckung}</p>}
        </Karte>
        <Karte titel={tw.stufenTitel}>
          <Tabelle>
            <tbody>
              {stufen.map((s) => (
                <tr key={s.k} className={s.art === "summe" || s.art === "start" ? "font-semibold" : undefined}>
                  <td>{tw.stufen[s.k]}</td>
                  <td className={rechts}>
                    <MitHerleitung
                      wert={
                        s.wert === null ? (
                          <Unbekannt t={t} />
                        ) : (
                          <span className={s.art === "abzug" ? "text-red-700" : undefined}>
                            {s.art === "abzug" ? "− " : ""}
                            {f.betragGanz(s.wert)}
                          </span>
                        )
                      }
                      herleitung={{ berechnung: tw.formeln[s.k], stichtag: f.datum(datum), hinweis: s.k === "verkaufspreis" ? verkaeufe.filter((x) => x.preisAnnahme).map((x) => `${x.name}: ${x.annahmeText}`).join(" · ") || undefined : undefined }}
                      t={t}
                      ausrichtung="rechts"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabelle>
          <p className="mt-3 text-xs text-slate-500">{tw.nichtEnthalten}</p>
        </Karte>
      </div>

      {e.kredite.length > 0 && (
        <Karte titel={tw.kreditTabelle}>
          <Tabelle>
            <thead>
              <tr>
                <th>{t.kredite.bezeichnung}</th>
                <th className={rechts}>{tw.anteil}</th>
                <th className={rechts}>{tw.restschuld}</th>
                <th className={rechts}>{tw.abloesung}</th>
                <th className={rechts}>{tw.vorfaelligkeit}</th>
              </tr>
            </thead>
            <tbody>
              {e.kredite.map((k) => (
                <tr key={k.id}>
                  <td>
                    <Link href={`/gesellschaften/kredite/${k.id}`} className="font-medium hover:underline">
                      {k.name}
                    </Link>
                  </td>
                  <td className={rechts}>{f.prozent(k.anteilProzent, 1)}</td>
                  <td className={rechts}>
                    {k.restschuld === null ? (
                      <Unbekannt t={t} />
                    ) : (
                      <>
                        {f.betragGanz(k.restschuld)}
                        <div className="text-xs text-slate-500">{fuelle(tw.stichtagHinweis, { datum: f.datum(k.restschuldStichtag) })}</div>
                      </>
                    )}
                  </td>
                  <td className={rechts}>{zeige(k.abloesung)}</td>
                  <td className={rechts}>{zeige(k.vorfaelligkeit)}</td>
                </tr>
              ))}
            </tbody>
          </Tabelle>
        </Karte>
      )}

      <Karte titel={tw.gesellschafterTabelle}>
        {e.gesellschafter.length === 0 ? (
          <Leer>{tw.keineGesellschafter}</Leer>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{tw.name}</th>
                <th className={rechts}>{tw.einlagen}</th>
                <th className={rechts}>{tw.bisherZurueck}</th>
                <th className={rechts}>{tw.offeneVorzugsrendite}</th>
                <th className={rechts}>{tw.stufen.rueckzahlung}</th>
                <th className={rechts}>{tw.stufen.vorzugsrendite}</th>
                <th className={rechts}>{tw.stufen.gewinn}</th>
                <th className={rechts}>{tw.summe}</th>
                <th className={rechts}>
                  <Begriff k="Multiple" t={t} />
                </th>
              </tr>
            </thead>
            <tbody>
              {e.gesellschafter.map((gs) => (
                <tr key={gs.id}>
                  <td className="font-medium">{gs.name}</td>
                  <td className={rechts}>{f.betragGanz(gs.einlagen)}</td>
                  <td className={rechts}>{f.betragGanz(gs.rueckzahlungenBisher.plus(gs.ausschuettungenBisher))}</td>
                  <td className={rechts}>{zeige(gs.offeneVorzugsrendite)}</td>
                  <td className={rechts}>{zeige(gs.rueckzahlung)}</td>
                  <td className={rechts}>{zeige(gs.vorzugsrendite)}</td>
                  <td className={rechts}>{zeige(gs.gewinn)}</td>
                  <td className={`${rechts} font-semibold`}>{zeige(gs.summe)}</td>
                  <td className={rechts} title={tw.multipleHinweis}>
                    {gs.multiple ? `${f.faktor(gs.multiple, 2)}×` : <Unbekannt t={t} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabelle>
        )}
        {v && (
          <p className="mt-3 text-xs text-slate-500">
            {tw.vertrag}: {tw.vorzugsrendite} {f.prozent(v.vorzugsrenditeProzent, 2)} p. a., {tw.verzinsungen[v.verzinsung]} · {tw.quelle}: {v.quelle}
          </p>
        )}
      </Karte>

      <Glossar begriffe={["Waterfall", "Vorzugsrendite", "Vorfaelligkeit", "Multiple", "Restschuld"]} t={t} />
    </div>
  );
}

function Luecken({ e, t }: { e: WaterfallErgebnis; t: ReturnType<typeof texte> }): ReactNode {
  const tw = t.waterfall;
  if (e.luecken.length === 0) return <p className="text-sm text-emerald-700">{tw.keineLuecken}</p>;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <div className="mb-2 font-semibold">{tw.luecken}</div>
      <ul className="list-disc space-y-0.5 pl-5">
        {e.luecken.map((l, i) => (
          <li key={i}>{fuelle(tw.lueckenText[l.art], { bezug: l.bezug ?? "" })}</li>
        ))}
      </ul>
    </div>
  );
}
