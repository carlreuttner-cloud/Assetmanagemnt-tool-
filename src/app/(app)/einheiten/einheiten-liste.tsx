/**
 * Liste der Einheiten mit Filtern nach Gesellschaft, Haus, Nutzungsart und Status. Wird von
 * /einheiten (alle Nutzungsarten) sowie /gewerbe und /stellplaetze (feste Nutzungsart) genutzt.
 */
import Link from "next/link";
import { AuswahlFilter, FilterZeile } from "@/components/auswahl-filter";
import { Begriff } from "@/components/herleitung";
import { StandVergleich } from "@/components/mieterstand";
import { LeerstandKreis, NutzungsartMarke, NutzungsartPunkt } from "@/components/nutzungsart";
import { Kachel, Kacheln, Leer, Marke, MieteZelle, Reiter, Seitenkopf, Tabelle, rechts } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { bereichsSicht } from "@/lib/auth/auswahl";
import type { Kontext } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { heute, isoDatum } from "@/lib/datum";
import { ladeHausverwaltungen, ladeZuordnungen, passtZuHv, verwaltungJeHaus } from "@/lib/daten/hausverwaltung";
import { ladeStaende, standAnsicht } from "@/lib/daten/mieterstand";
import { hvOptionen } from "../hausverwaltungen/ton";
import { erlaubt } from "@/lib/daten/portfolio";
import { einParam, filterHref } from "@/lib/filter";
import { formatierer } from "@/lib/format";
import { dezimal } from "@/lib/geld";
import { istAktiv, leerstandQuoteArt, type ArtSummen } from "@/lib/kennzahlen";
import { inFlaeche, NUTZUNGSARTEN, nutzungsartAus, type Nutzungsart } from "@/lib/nutzungsart";

type Suche = Record<string, string | string[] | undefined>;

export async function EinheitenListe({
  kontext,
  sp,
  pfad,
  festeArt,
  titel,
  beschreibung,
}: {
  kontext: Kontext;
  sp: Suche;
  pfad: string;
  /** feste Nutzungsart (Reiter Gewerbe, Stellplätze); ohne = Filter wählbar */
  festeArt?: Nutzungsart;
  titel: string;
  beschreibung: string;
}) {
  const t = texte(kontext.mandant.sprache);
  const f = formatierer(kontext.mandant);
  const tl = t.listen;
  const tn = t.nutzung;
  const stichtag = heute();
  const art = festeArt ?? nutzungsartAus(sp.art);
  const filter = { g: einParam(sp.g), h: einParam(sp.h), status: einParam(sp.status), art: festeArt ? undefined : art, hv: einParam(sp.hv), sort: sp.sort === "hv" ? "hv" : undefined };
  const sicht = await bereichsSicht(kontext);
  const darfMieter = darf(kontext.rolle, "mieter");

  const [haeuser, einheiten, staende, zuordnungen, verwaltungen] = await Promise.all([
    kontext.db.haus.findMany({
      where: { id: erlaubt(sicht.hausIds), gesellschaftId: filter.g },
      orderBy: { bezeichnung: "asc" },
      select: { id: true, bezeichnung: true, gesellschaft: { select: { id: true, name: true } } },
    }),
    kontext.db.einheit.findMany({
      where: { hausId: erlaubt(sicht.hausIds, filter.h), haus: filter.g ? { gesellschaftId: filter.g } : undefined, art },
      orderBy: [{ haus: { bezeichnung: "asc" } }, { art: "asc" }, { bezeichnung: "asc" }],
      include: {
        haus: { select: { id: true, bezeichnung: true, gesellschaft: { select: { name: true } } } },
        mietverhaeltnisse: { include: { mieter: { select: { name: true } } } },
      },
    }),
    ladeStaende(kontext, erlaubt(sicht.hausIds, filter.h), filter.g),
    ladeZuordnungen(kontext),
    ladeHausverwaltungen(kontext),
  ]);
  const hvJeHaus = verwaltungJeHaus(zuordnungen, stichtag);
  const passtHv = (hausId: string) => passtZuHv(filter.hv, hvJeHaus.get(hausId));
  const staendeAnsicht = standAnsicht(staende, { stand: einParam(sp.stand), vergleich: einParam(sp.vergleich), art, filter: passtHv });
  const alleGesellschaften = await kontext.db.gesellschaft.findMany({
    where: { id: erlaubt(sicht.gesellschaftIds), haeuser: { some: { id: erlaubt(sicht.hausIds) } } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const alleZeilen = einheiten.filter((e) => passtHv(e.hausId)).map((e) => {
    const aktiv = e.mietverhaeltnisse.filter((m) => istAktiv({ beginn: isoDatum(m.beginn), ende: isoDatum(m.ende) }, stichtag));
    return { e, aktiv, soll: aktiv.reduce((s, m) => s.plus(dezimal(m.sollMiete)), dezimal(0)), leer: aktiv.length === 0 };
  });
  const zeilen = filter.status === "leer" ? alleZeilen.filter((z) => z.leer) : [...alleZeilen];
  // Sortierung nach Hausverwaltung (ohne zuletzt), innerhalb wie bisher
  if (filter.sort === "hv") zeilen.sort((a, b) => (hvJeHaus.get(a.e.hausId)?.name ?? "\uffff").localeCompare(hvJeHaus.get(b.e.hausId)?.name ?? "\uffff", "de"));
  const sollVermietet = zeilen.filter((z) => !z.leer).reduce((s, z) => s.plus(z.soll), dezimal(0));
  const leere = zeilen.filter((z) => z.leer);
  const erwartet = leere.reduce((s, z) => (z.e.erwarteteMiete ? s.plus(dezimal(z.e.erwarteteMiete)) : s), dezimal(0));
  const ohneErwartet = leere.filter((z) => !z.e.erwarteteMiete).length;

  // Summen je Nutzungsart (über alle Zeilen der Auswahl)
  const nachArt = Object.fromEntries(
    NUTZUNGSARTEN.map((a) => {
      const z = alleZeilen.filter((x) => x.e.art === a);
      const fl = (liste: typeof z) => liste.reduce((s, x) => s.plus(inFlaeche(a) ? dezimal(x.e.flaeche) : 0), dezimal(0));
      const summe = (liste: typeof z, feld: "sollMiete" | "istMiete") => liste.reduce((s, x) => x.aktiv.reduce((y, m) => y.plus(dezimal(m[feld])), s), dezimal(0));
      const leerListe = z.filter((x) => x.leer);
      const werte: ArtSummen = {
        einheiten: z.length,
        leereEinheiten: leerListe.length,
        flaeche: fl(z),
        leerFlaeche: fl(leerListe),
        sollMonat: summe(z, "sollMiete"),
        istMonat: summe(z, "istMiete"),
        erwartetLeerMonat: leerListe.reduce((s, x) => s.plus(x.e.erwarteteMiete ? dezimal(x.e.erwarteteMiete) : 0), dezimal(0)),
      };
      return [a, werte];
    }),
  ) as Record<Nutzungsart, ArtSummen>;
  const sichtbareArten = NUTZUNGSARTEN.filter((a) => nachArt[a].einheiten > 0);
  const mitFlaeche = !art || inFlaeche(art);

  const optionenGesellschaft = [
    { href: filterHref(pfad, { ...filter, h: undefined }, "g", undefined), text: tl.alleGesellschaften, aktiv: !filter.g },
    ...alleGesellschaften.map((g) => ({ href: filterHref(pfad, { ...filter, h: undefined }, "g", g.id), text: g.name, aktiv: filter.g === g.id })),
  ];
  const optionenHaus = [
    { href: filterHref(pfad, filter, "h", undefined), text: tl.alleHaeuser, aktiv: !filter.h },
    ...haeuser.map((h) => ({ href: filterHref(pfad, filter, "h", h.id), text: h.bezeichnung, aktiv: filter.h === h.id, gruppe: filter.g ? undefined : h.gesellschaft.name })),
  ];

  return (
    <div className="space-y-4">
      <Seitenkopf titel={titel} beschreibung={beschreibung} />

      <StandVergleich
        ansicht={staendeAnsicht}
        t={t}
        f={f}
        pfad={pfad}
        erhalten={{ ...filter }}
        nurAenderungen={sp.nur === "1"}
        offen={!!(sp.stand || sp.vergleich || sp.nur)}
      />

      <Kacheln>
        {(festeArt ? [festeArt] : sichtbareArten).map((a) => {
          const x = nachArt[a];
          return (
            <Kachel
              key={a}
              titel={
                <span className="inline-flex items-center gap-1.5">
                  <NutzungsartPunkt art={a} gross />
                  {t.nutzungsarten[a]}
                </span>
              }
              wert={inFlaeche(a) ? f.flaeche(x.flaeche) : `${x.einheiten} ${tn.stueck}`}
              unter={
                <>
                  {fuelle(tn.einheitenWert, { anzahl: x.einheiten })} · {x.leereEinheiten} {tn.leer} (<Begriff k="Leerstand" t={t}>{t.kennzahlen.leerstand}</Begriff>{" "}
                  {f.prozent(leerstandQuoteArt(a, x), 1)})
                  <div>
                    {t.kennzahlen.sollMiete}: <MieteZelle monat={f.betrag(x.sollMonat)} jahr={f.jahresmiete(x.sollMonat)} />
                  </div>
                </>
              }
            />
          );
        })}
        {!festeArt && sichtbareArten.length > 1 && (
          <Kachel titel={tn.leerstandJeArt} wert={<LeerstandKreis nachArt={nachArt} t={t} f={f} groesse={44} />} unter={<span>{tn.kreisTitel}</span>} />
        )}
      </Kacheln>

      <FilterZeile>
        {alleGesellschaften.length > 1 && <AuswahlFilter name="g" label={t.navigation.gesellschaften} optionen={optionenGesellschaft} />}
        {haeuser.length > 1 && <AuswahlFilter name="h" label={t.navigation.haeuser} optionen={optionenHaus} />}
        {verwaltungen.length > 0 && (
          <>
            <AuswahlFilter name="hv" label={t.hausverwaltungen.filter} optionen={hvOptionen(verwaltungen, filter.hv, (w) => filterHref(pfad, filter, "hv", w), t)} />
            <AuswahlFilter
              name="sort"
              label={t.hausverwaltungen.sortierung}
              optionen={[
                { href: filterHref(pfad, filter, "sort", undefined), text: t.hausverwaltungen.sortStandard, aktiv: !filter.sort },
                { href: filterHref(pfad, filter, "sort", "hv"), text: t.hausverwaltungen.sortHv, aktiv: filter.sort === "hv" },
              ]}
            />
          </>
        )}
      </FilterZeile>
      {!festeArt && (
        <Reiter
          eintraege={[
            { href: filterHref(pfad, filter, "art", undefined), text: tn.alle, aktiv: !art },
            ...NUTZUNGSARTEN.map((a) => ({
              href: filterHref(pfad, filter, "art", a),
              text: (
                <span className="inline-flex items-center gap-1.5">
                  <NutzungsartPunkt art={a} />
                  {t.nutzungsarten[a]}
                </span>
              ),
              aktiv: art === a,
            })),
          ]}
        />
      )}
      <Reiter
        eintraege={[
          { href: filterHref(pfad, filter, "status", undefined), text: t.allgemein.alle, aktiv: !filter.status },
          { href: filterHref(pfad, filter, "status", "leer"), text: tl.nurLeer, aktiv: filter.status === "leer" },
        ]}
      />

      <div className="rounded-xl border border-slate-200 bg-white">
        {zeilen.length === 0 ? (
          <div className="px-5">
            <Leer>{festeArt ? tn.keineEinheiten : t.allgemein.keineDaten}</Leer>
          </div>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{tl.einheit}</th>
                <th>{tl.haus}</th>
                <th>{t.einheiten.lage}</th>
                {mitFlaeche && <th className={rechts}>{t.einheiten.flaeche}</th>}
                <th>{t.einheiten.status}</th>
                <th>{tl.mieter}</th>
                <th className={rechts}>
                  {t.kennzahlen.sollMiete} ({t.allgemein.monat} / {t.allgemein.jahr})
                </th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map(({ e, aktiv, soll, leer }) => (
                <tr key={e.id} className={leer ? "bg-amber-50/40" : "hover:bg-slate-50"}>
                  <td className="font-medium">
                    {e.bezeichnung}
                    <div className="mt-0.5">
                      <NutzungsartMarke art={e.art} t={t} />
                    </div>
                  </td>
                  <td>
                    <Link href={`/haeuser/${e.haus.id}#einheiten`} className="hover:underline">
                      {e.haus.bezeichnung}
                    </Link>
                    <div className="text-xs text-slate-500">{e.haus.gesellschaft.name}</div>
                    {hvJeHaus.get(e.hausId) && <div className="text-xs text-slate-500">{t.hausverwaltungen.kurz}: {hvJeHaus.get(e.hausId)!.name}</div>}
                  </td>
                  <td>{e.lage}</td>
                  {mitFlaeche && (
                    <td className={rechts}>{inFlaeche(e.art) ? f.zahl(e.flaeche, 1) : <span className="text-xs text-slate-500">1 {tn.stueck}</span>}</td>
                  )}
                  <td>{leer ? <Marke ton="warnung">{tl.leerstehend}</Marke> : <Marke ton="gut">{t.haeuser.vermietet}</Marke>}</td>
                  <td>
                    {aktiv.map((m, i) => (
                      <span key={m.id}>
                        {i > 0 && ", "}
                        {darfMieter ? (
                          <Link href={`/mieter/vertraege/${m.id}`} className="hover:underline">
                            {m.mieter.name}
                          </Link>
                        ) : (
                          m.mieter.name
                        )}
                      </span>
                    ))}
                  </td>
                  <td className={rechts}>
                    {leer ? (
                      e.erwarteteMiete ? (
                        <span title={tl.erwarteteMiete} className="italic text-slate-500">
                          <MieteZelle monat={f.betrag(e.erwarteteMiete)} jahr={f.jahresmiete(e.erwarteteMiete)} />
                          <div className="text-xs">{tl.erwarteteMiete}</div>
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">{t.allgemein.unbekannt}</span>
                      )
                    ) : (
                      <MieteZelle monat={f.betrag(soll)} jahr={f.jahresmiete(soll)} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            {zeilen.length > 1 && (
              <tfoot>
                {sichtbareArten.length > 1 &&
                  sichtbareArten.map((a) => {
                    const z = zeilen.filter((x) => x.e.art === a);
                    if (z.length === 0) return null;
                    const fl = z.reduce((s, x) => s.plus(dezimal(x.e.flaeche)), dezimal(0));
                    const soll = z.filter((x) => !x.leer).reduce((s, x) => s.plus(x.soll), dezimal(0));
                    return (
                      <tr key={a} className="text-slate-600">
                        <td colSpan={3}>
                          <span className="inline-flex items-center gap-1.5 font-normal">
                            <NutzungsartPunkt art={a} />
                            {t.nutzungsarten[a]} ({z.length})
                          </span>
                        </td>
                        {mitFlaeche && <td className={rechts}>{inFlaeche(a) ? f.zahl(fl, 1) : `${z.length} ${tn.stueck}`}</td>}
                        <td colSpan={2} />
                        <td className={rechts}>
                          <MieteZelle monat={f.betrag(soll)} jahr={f.jahresmiete(soll)} />
                        </td>
                      </tr>
                    );
                  })}
                <tr>
                  <td colSpan={3}>
                    {t.allgemein.summe} ({zeilen.length})
                  </td>
                  {mitFlaeche && (
                    <td className={rechts}>
                      {f.zahl(
                        zeilen.reduce((s, z) => s.plus(inFlaeche(z.e.art) ? dezimal(z.e.flaeche) : 0), dezimal(0)),
                        1,
                      )}
                      {!art && <div className="text-xs font-normal text-slate-500">{tn.wohnflaeche} + {tn.gewerbeflaeche}</div>}
                    </td>
                  )}
                  <td colSpan={2} />
                  <td className={rechts}>
                    <div className="text-xs font-normal text-slate-500">{tl.vermietetSumme}</div>
                    <MieteZelle monat={f.betrag(sollVermietet)} jahr={f.jahresmiete(sollVermietet)} />
                    {leere.length > 0 && (
                      <>
                        <div className="mt-1 text-xs font-normal text-slate-500">
                          {tl.erwartetSumme}
                          {ohneErwartet > 0 && ` (${tl.summeUnvollstaendig})`}
                        </div>
                        <MieteZelle monat={f.betrag(erwartet)} jahr={f.jahresmiete(erwartet)} />
                      </>
                    )}
                  </td>
                </tr>
              </tfoot>
            )}
          </Tabelle>
        )}
      </div>
      {ohneErwartet > 0 && <p className="mt-2 text-xs text-amber-800">{fuelle(tl.summeErwartetFehlt, { anzahl: ohneErwartet })}</p>}
    </div>
  );
}
