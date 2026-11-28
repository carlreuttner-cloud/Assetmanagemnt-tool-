import Link from "next/link";
import { StandVergleich } from "@/components/mieterstand";
import { LeerstandKreis, NutzungsartMarke, NutzungsartPunkt } from "@/components/nutzungsart";
import { Kachel, Kacheln, KnopfLink, Leer, Marke, MieteZelle, Reiter, Seitenkopf, Tabelle, knopfKlasse, rechts } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { bereichsSicht } from "@/lib/auth/auswahl";
import { heute, isoDatum } from "@/lib/datum";
import { ladeHausverwaltungen, ladeZuordnungen, passtZuHv, verwaltungJeHaus } from "@/lib/daten/hausverwaltung";
import { ladeStaende, standAnsicht } from "@/lib/daten/mieterstand";
import { erlaubt } from "@/lib/daten/portfolio";
import { dezimal } from "@/lib/geld";
import { formatierer } from "@/lib/format";
import { istAktiv, type ArtSummen } from "@/lib/kennzahlen";
import { inFlaeche, NUTZUNGSARTEN, nutzungsartAus, type Nutzungsart } from "@/lib/nutzungsart";
import { mietStatus, monateSeitErhoehung } from "@/lib/mietverhaeltnis";

const FILTER = ["aktiv", "rueckstand", "abweichung", "beendet", "alle", "leerstand"] as const;
type Filter = (typeof FILTER)[number];

export default async function MieterSeite({ searchParams }: PageProps<"/mieter">) {
  const sp = await searchParams;
  const status: Filter = FILTER.find((x) => x === sp.status) ?? "aktiv";
  const hausFilter = typeof sp.haus === "string" && sp.haus ? sp.haus : undefined;
  const suche = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const art = nutzungsartAus(sp.art);
  const hv = typeof sp.hv === "string" && sp.hv ? sp.hv : undefined;
  const sort = sp.sort === "hv" ? "hv" : undefined;

  const kontext = await pruefeZugriff("mieter");
  const t = texte(kontext.mandant.sprache);
  const f = formatierer(kontext.mandant);
  const tm = t.mieter;
  const stichtag = heute();
  const sicht = await bereichsSicht(kontext);
  const hausIds = erlaubt(sicht.hausIds, hausFilter);

  const [haeuser, alleEinheiten, staende, zuordnungen, verwaltungen] = await Promise.all([
    kontext.db.haus.findMany({ where: { id: erlaubt(sicht.hausIds) }, orderBy: { bezeichnung: "asc" }, select: { id: true, bezeichnung: true } }),
    kontext.db.einheit.findMany({
      where: { hausId: hausIds, art },
      orderBy: [{ haus: { bezeichnung: "asc" } }, { bezeichnung: "asc" }],
      include: {
        haus: { select: { id: true, bezeichnung: true } },
        mietverhaeltnisse: { include: { mieter: { select: { id: true, name: true, istFirma: true } } }, orderBy: { beginn: "desc" } },
      },
    }),
    ladeStaende(kontext, hausIds),
    ladeZuordnungen(kontext),
    ladeHausverwaltungen(kontext),
  ]);
  const hvJeHaus = verwaltungJeHaus(zuordnungen, stichtag);
  const passtHv = (hausId: string) => passtZuHv(hv, hvJeHaus.get(hausId));
  const einheiten = alleEinheiten.filter((e) => passtHv(e.hausId));
  const hvName = (hausId: string) => hvJeHaus.get(hausId)?.name ?? "\uffff";
  const ein = (w: string | string[] | undefined) => (typeof w === "string" ? w : undefined);
  const staendeAnsicht = standAnsicht(staende, { stand: ein(sp.stand), vergleich: ein(sp.vergleich), art, filter: passtHv });

  const vertraege = einheiten.flatMap((e) =>
    e.mietverhaeltnisse.map((m) => {
      const beginn = isoDatum(m.beginn);
      const ende = isoDatum(m.ende);
      const soll = dezimal(m.sollMiete);
      const ist = dezimal(m.istMiete);
      return {
        id: m.id,
        mieter: m.mieter,
        einheit: e,
        beginn,
        ende,
        soll,
        ist,
        rueckstand: dezimal(m.rueckstand),
        status: mietStatus({ beginn, ende }, stichtag),
        monate: monateSeitErhoehung({ beginn, letzteMieterhoehung: isoDatum(m.letzteMieterhoehung) }, stichtag),
        letzteMieterhoehung: isoDatum(m.letzteMieterhoehung),
        notiz: m.notiz,
      };
    }),
  );
  const auswahl = vertraege
    .filter((v) => {
      if (suche && !v.mieter.name.toLowerCase().includes(suche)) return false;
      switch (status) {
        case "aktiv":
          return v.status === "aktiv";
        case "rueckstand":
          return v.rueckstand.greaterThan(0);
        case "abweichung":
          return v.status === "aktiv" && v.ist.lessThan(v.soll);
        case "beendet":
          return v.status === "beendet";
        default:
          return true;
      }
    })
    .sort((a, b) => (sort === "hv" ? hvName(a.einheit.hausId).localeCompare(hvName(b.einheit.hausId), "de") : 0) || a.mieter.name.localeCompare(b.mieter.name, "de"));

  const aktive = vertraege.filter((v) => v.status === "aktiv");
  const summeSoll = aktive.reduce((s, v) => s.plus(v.soll), dezimal(0));
  const summeIst = aktive.reduce((s, v) => s.plus(v.ist), dezimal(0));
  const summeRueckstand = vertraege.reduce((s, v) => s.plus(v.rueckstand), dezimal(0));
  const leere = einheiten
    .filter((e) => !e.mietverhaeltnisse.some((m) => istAktiv({ beginn: isoDatum(m.beginn), ende: isoDatum(m.ende) }, stichtag)))
    .map((e) => ({ e, leerSeit: e.mietverhaeltnisse.map((m) => isoDatum(m.ende)).filter((x): x is string => !!x && x < stichtag).sort().at(-1) ?? null }));
  if (sort === "hv") leere.sort((a, b) => hvName(a.e.hausId).localeCompare(hvName(b.e.hausId), "de"));
  // Leerstand je Nutzungsart für das Kreisdiagramm (Fläche nur Wohnen und Gewerbe)
  const leerNachArt = Object.fromEntries(
    NUTZUNGSARTEN.map((a) => {
      const alle = einheiten.filter((e) => e.art === a);
      const leer = leere.filter((x) => x.e.art === a).map((x) => x.e);
      const fl = (l: typeof alle) => l.reduce((s, e) => s.plus(inFlaeche(a) ? dezimal(e.flaeche) : 0), dezimal(0));
      const werte: ArtSummen = {
        einheiten: alle.length, leereEinheiten: leer.length, flaeche: fl(alle), leerFlaeche: fl(leer),
        sollMonat: dezimal(0), istMonat: dezimal(0),
        erwartetLeerMonat: leer.reduce((s, e) => s.plus(e.erwarteteMiete ? dezimal(e.erwarteteMiete) : 0), dezimal(0)),
      };
      return [a, werte];
    }),
  ) as Record<Nutzungsart, ArtSummen>;
  const summeLeer = leere.reduce((s, x) => s.plus(x.e.erwarteteMiete ? dezimal(x.e.erwarteteMiete) : 0), dezimal(0));
  const auswahlSoll = auswahl.reduce((s, v) => s.plus(v.soll), dezimal(0));
  const auswahlIst = auswahl.reduce((s, v) => s.plus(v.ist), dezimal(0));

  const schreiben = darf(kontext.rolle, "mieter", "schreiben");
  const link = (werte: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const alle = { status, haus: hausFilter, art, q: suche || undefined, hv, sort, ...werte };
    for (const [k, v] of Object.entries(alle)) if (v) p.set(k, v);
    return `/mieter?${p.toString()}`;
  };
  const tk = t.kennzahlen;

  return (
    <div className="space-y-6">
      <Seitenkopf
        titel={tm.titel}
        beschreibung={t.seiten.mieter}
        aktionen={schreiben && <KnopfLink href="/mieter/neu" art="primaer">{tm.neuesMietverhaeltnis}</KnopfLink>}
      />

      <StandVergleich
        ansicht={staendeAnsicht}
        t={t}
        f={f}
        pfad="/mieter"
        erhalten={{ status, haus: hausFilter, art, q: suche || undefined, hv, sort }}
        nurAenderungen={sp.nur === "1"}
        offen={!!(sp.stand || sp.vergleich || sp.nur)}
      />

      <Kacheln>
        <Kachel titel={tk.sollMieteMonat} wert={f.betrag(summeSoll)} unter={`${tk.sollMieteJahr}: ${f.jahresmiete(summeSoll)}`} />
        <Kachel
          titel={tk.istMieteMonat}
          wert={f.betrag(summeIst)}
          unter={`${tk.istMieteJahr}: ${f.jahresmiete(summeIst)} · ${tm.differenz}: ${f.betrag(summeIst.minus(summeSoll))}`}
          ton={summeIst.lessThan(summeSoll) ? "warnung" : undefined}
        />
        <Kachel titel={tk.rueckstand} wert={f.betrag(summeRueckstand)} ton={summeRueckstand.greaterThan(0) ? "schlecht" : undefined} unter={fuelle(tm.anzahl, { anzahl: aktive.length })} />
        <Kachel
          titel={tm.leerstand}
          wert={`${leere.length} ${tk.einheiten}`}
          unter={
            <>
              {`${tk.erwartetLeer}: ${f.betrag(summeLeer)} / ${f.jahresmiete(summeLeer)}`}
              <div className="mt-2">
                <LeerstandKreis nachArt={leerNachArt} t={t} f={f} groesse={40} legende />
              </div>
            </>
          }
          ton={leere.length > 0 ? "warnung" : undefined}
        />
      </Kacheln>

      <div>
        <Reiter
          eintraege={FILTER.map((x) => ({
            href: link({ status: x }),
            text: x === "leerstand" ? `${tm.leerstand} (${leere.length})` : tm.filter[x],
            aktiv: status === x,
          }))}
        />
        <Reiter
          eintraege={[
            { href: link({ art: undefined }), text: t.nutzung.alle, aktiv: !art },
            ...NUTZUNGSARTEN.map((a) => ({
              href: link({ art: a }),
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
        <form className="mb-4 flex flex-wrap items-end gap-2 text-sm" action="/mieter">
          <input type="hidden" name="status" value={status} />
          {art && <input type="hidden" name="art" value={art} />}
          <select name="haus" defaultValue={hausFilter ?? ""} className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5">
            <option value="">{tm.alleHaeuser}</option>
            {haeuser.map((h) => (
              <option key={h.id} value={h.id}>
                {h.bezeichnung}
              </option>
            ))}
          </select>
          {verwaltungen.length > 0 && (
            <>
              <select name="hv" defaultValue={hv ?? ""} aria-label={t.hausverwaltungen.filter} className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5">
                <option value="">{t.hausverwaltungen.alle}</option>
                {verwaltungen.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
                <option value="ohne">{t.hausverwaltungen.ohne}</option>
              </select>
              <select name="sort" defaultValue={sort ?? ""} aria-label={t.hausverwaltungen.sortierung} className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5">
                <option value="">{t.hausverwaltungen.sortStandardMieter}</option>
                <option value="hv">{t.hausverwaltungen.sortHv}</option>
              </select>
            </>
          )}
          {status !== "leerstand" && (
            <input name="q" defaultValue={suche} placeholder={tm.suche} className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5" />
          )}
          <button className={knopfKlasse("sekundaer")}>{tm.filtern}</button>
        </form>

        <div className="rounded-xl border border-slate-200 bg-white">
          {status === "leerstand" ? (
            leere.length === 0 ? (
              <div className="px-5">
                <Leer>{tm.keineLeerstaende}</Leer>
              </div>
            ) : (
              <Tabelle>
                <thead>
                  <tr>
                    <th>{tm.haus}</th>
                    <th>{tm.einheit}</th>
                    <th className={rechts}>{t.einheiten.flaeche}</th>
                    <th>{tm.leerSeit}</th>
                    <th className={rechts}>{tk.erwartetLeer} ({t.allgemein.monat} / {t.allgemein.jahr})</th>
                    <th>{t.allgemein.notiz}</th>
                    {schreiben && <th />}
                  </tr>
                </thead>
                <tbody>
                  {leere.map(({ e, leerSeit }) => (
                    <tr key={e.id}>
                      <td>
                        <Link href={`/haeuser/${e.haus.id}`} className="hover:underline">
                          {e.haus.bezeichnung}
                        </Link>
                        {hvJeHaus.get(e.hausId) && <div className="text-xs text-slate-500">{t.hausverwaltungen.kurz}: {hvJeHaus.get(e.hausId)!.name}</div>}
                      </td>
                      <td>
                        {e.bezeichnung} <span className="text-xs text-slate-500">{e.lage}</span>
                        <div className="mt-0.5">
                          <NutzungsartMarke art={e.art} t={t} />
                        </div>
                      </td>
                      <td className={rechts}>{inFlaeche(e.art) ? `${f.zahl(e.flaeche, 1)} m²` : `1 ${t.nutzung.stueck}`}</td>
                      <td>{f.datum(leerSeit)}</td>
                      <td className={rechts}>
                        {e.erwarteteMiete ? <MieteZelle monat={f.betrag(e.erwarteteMiete)} jahr={f.jahresmiete(e.erwarteteMiete)} /> : "–"}
                      </td>
                      <td className="text-slate-500">{e.notiz}</td>
                      {schreiben && (
                        <td className="text-right">
                          <Link href={`/mieter/neu?einheit=${e.id}`} className="text-xs text-slate-600 hover:underline">
                            {tm.neuesMietverhaeltnis}
                          </Link>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={4}>{t.allgemein.summe}</td>
                    <td className={rechts}>
                      <MieteZelle monat={f.betrag(summeLeer)} jahr={f.jahresmiete(summeLeer)} />
                    </td>
                    <td colSpan={schreiben ? 2 : 1} />
                  </tr>
                </tfoot>
              </Tabelle>
            )
          ) : auswahl.length === 0 ? (
            <div className="px-5">
              <Leer>{t.allgemein.keineDaten}</Leer>
            </div>
          ) : (
            <Tabelle>
              <thead>
                <tr>
                  <th>{tm.mieter}</th>
                  <th>
                    {tm.haus} / {tm.einheit}
                  </th>
                  <th>{tm.beginn}</th>
                  <th className={rechts}>
                    {tk.sollMiete} ({t.allgemein.monat} / {t.allgemein.jahr})
                  </th>
                  <th className={rechts}>
                    {tk.istMiete} ({t.allgemein.monat} / {t.allgemein.jahr})
                  </th>
                  <th className={rechts}>{tm.rueckstand}</th>
                  <th className={rechts}>{tm.monateSeitErhoehung}</th>
                  <th>{tm.status}</th>
                </tr>
              </thead>
              <tbody>
                {auswahl.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-50">
                    <td>
                      <Link href={`/mieter/vertraege/${v.id}`} className="font-medium hover:underline">
                        {v.mieter.name}
                      </Link>
                      {v.notiz && <div className="max-w-xs truncate text-xs text-slate-500">{v.notiz}</div>}
                    </td>
                    <td>
                      {v.einheit.haus.bezeichnung}
                      {hvJeHaus.get(v.einheit.hausId) && <div className="text-xs text-slate-500">{t.hausverwaltungen.kurz}: {hvJeHaus.get(v.einheit.hausId)!.name}</div>}
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                        {v.einheit.bezeichnung} <NutzungsartMarke art={v.einheit.art} t={t} />
                      </div>
                    </td>
                    <td className="tabular-nums">
                      {f.datum(v.beginn)}
                      {v.ende && <div className="text-xs text-slate-500">– {f.datum(v.ende)}</div>}
                    </td>
                    <td className={rechts}>
                      <MieteZelle monat={f.betrag(v.soll)} jahr={f.jahresmiete(v.soll)} />
                    </td>
                    <td className={`${rechts} ${v.ist.lessThan(v.soll) ? "text-red-700" : ""}`}>
                      <MieteZelle monat={f.betrag(v.ist)} jahr={f.jahresmiete(v.ist)} />
                    </td>
                    <td className={`${rechts} ${v.rueckstand.greaterThan(0) ? "font-medium text-red-700" : "text-slate-400"}`}>{f.betrag(v.rueckstand)}</td>
                    <td className={rechts} title={v.letzteMieterhoehung ? f.datum(v.letzteMieterhoehung) : undefined}>
                      {v.status === "aktiv" ? v.monate : "–"}
                    </td>
                    <td>
                      <Marke ton={v.status === "aktiv" ? "gut" : "neutral"}>{tm.statusArten[v.status]}</Marke>
                    </td>
                  </tr>
                ))}
              </tbody>
              {auswahl.length > 1 && (
                <tfoot>
                  <tr>
                    <td colSpan={3}>
                      {tm.summe} ({auswahl.length})
                    </td>
                    <td className={rechts}>
                      <MieteZelle monat={f.betrag(auswahlSoll)} jahr={f.jahresmiete(auswahlSoll)} />
                    </td>
                    <td className={rechts}>
                      <MieteZelle monat={f.betrag(auswahlIst)} jahr={f.jahresmiete(auswahlIst)} />
                    </td>
                    <td className={rechts}>{f.betrag(auswahl.reduce((s, v) => s.plus(v.rueckstand), dezimal(0)))}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </Tabelle>
          )}
        </div>
      </div>
    </div>
  );
}
