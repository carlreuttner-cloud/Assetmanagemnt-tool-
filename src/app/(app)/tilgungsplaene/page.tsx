import Link from "next/link";
import { AuswahlFilter, FilterZeile } from "@/components/auswahl-filter";
import { Karte, Leer, Seitenkopf, Tabelle, rechts } from "@/components/ui";
import { texte } from "@/i18n";
import { bereichsSicht } from "@/lib/auth/auswahl";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { alsDbDatum, heute, isoDatum } from "@/lib/datum";
import { erlaubt } from "@/lib/daten/portfolio";
import { auswahlOptionen, einParam, filterHref } from "@/lib/filter";
import { formatierer } from "@/lib/format";

export default async function TilgungsplaeneSeite({ searchParams }: PageProps<"/tilgungsplaene">) {
  const sp = await searchParams;
  const kontext = await pruefeZugriff("gesellschaften");
  const t = texte(kontext.mandant.sprache);
  const f = formatierer(kontext.mandant);
  const tl = t.listen;
  const filter = { g: einParam(sp.g), plan: einParam(sp.plan), v: einParam(sp.v) };
  const sicht = await bereichsSicht(kontext);
  const ab = alsDbDatum(heute());

  const [gesellschaften, kredite] = await Promise.all([
    kontext.db.gesellschaft.findMany({ where: { id: erlaubt(sicht.gesellschaftIds) }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    kontext.db.kredit.findMany({
      where: { gesellschaftId: erlaubt(sicht.gesellschaftIds, filter.g) },
      orderBy: [{ gesellschaft: { name: "asc" } }, { bezeichnung: "asc" }],
      select: {
        id: true,
        bezeichnung: true,
        bank: true,
        gesellschaft: { select: { id: true, name: true } },
        // Nur die aktuelle (höchste) Version des Plans
        tilgungsplaene: {
          orderBy: { version: "desc" },
          take: 1,
          select: {
            id: true,
            version: true,
            gueltigAb: true,
            bezeichnung: true,
            _count: { select: { zeilen: true } },
            zeilen: { where: { faelligAm: { gte: ab } }, orderBy: { faelligAm: "asc" }, take: 1, select: { faelligAm: true, rate: true, zins: true, tilgung: true, restschuld: true } },
          },
        },
      },
    }),
  ]);
  // Erste und letzte Zeile je Plan für den Zeitraum
  const planIds = kredite.flatMap((k) => k.tilgungsplaene.map((p) => p.id));
  const grenzen = await kontext.db.tilgungsplanZeile.groupBy({
    by: ["tilgungsplanId"],
    where: { tilgungsplanId: { in: planIds } },
    _min: { faelligAm: true },
    _max: { faelligAm: true },
  });
  const zeitraum = new Map(grenzen.map((g) => [g.tilgungsplanId, g]));
  const mitPlan = kredite.filter((k) => k.tilgungsplaene.length > 0);
  const ohnePlan = kredite.filter((k) => k.tilgungsplaene.length === 0);

  // Gewählter Tilgungsplan (Kredit) mit allen Versionen; ohne Versionsangabe die aktuelle.
  const gewaehlt = filter.plan ? mitPlan.find((k) => k.id === filter.plan) : undefined;
  const versionen = gewaehlt
    ? await kontext.db.tilgungsplan.findMany({
        where: { kreditId: gewaehlt.id },
        orderBy: { version: "desc" },
        select: { id: true, version: true, gueltigAb: true, bezeichnung: true },
      })
    : [];
  const version = versionen.find((x) => String(x.version) === filter.v) ?? versionen[0];
  const zeilen = version
    ? await kontext.db.tilgungsplanZeile.findMany({
        where: { tilgungsplanId: version.id },
        orderBy: { faelligAm: "asc" },
        select: { id: true, faelligAm: true, rate: true, zins: true, tilgung: true, restschuld: true },
      })
    : [];
  const heuteIso = heute();
  const optionenPlan = auswahlOptionen(
    "/tilgungsplaene",
    filter,
    "plan",
    tl.planUebersicht,
    mitPlan.map((k) => ({ id: k.id, name: `${k.bezeichnung}${k.bank ? ` · ${k.bank}` : ""}`, gruppe: filter.g ? undefined : k.gesellschaft.name })),
    ["v"],
  );

  return (
    <div className="space-y-4">
      <Seitenkopf titel={t.navigation.tilgungsplaene} beschreibung={t.seiten.tilgungsplaene} />
      <FilterZeile>
        {gesellschaften.length > 1 && (
          <AuswahlFilter name="g" label={tl.gesellschaft} optionen={auswahlOptionen("/tilgungsplaene", filter, "g", tl.alleGesellschaften, gesellschaften, ["plan", "v"])} />
        )}
        {mitPlan.length > 0 && <AuswahlFilter name="plan" label={tl.tilgungsplan} optionen={optionenPlan} />}
        {versionen.length > 1 && (
          <AuswahlFilter
            name="v"
            label={tl.version}
            optionen={versionen.map((x, i) => ({
              href: filterHref("/tilgungsplaene", filter, "v", String(x.version)),
              text: `${tl.version} ${x.version} · ${tl.gueltigAb} ${f.datum(x.gueltigAb)}${i === 0 ? ` (${tl.aktuell})` : ""}`,
              aktiv: x.id === version?.id,
            }))}
          />
        )}
      </FilterZeile>
      <p className="text-sm text-slate-600">{tl.planHinweis}</p>

      {gewaehlt && version && (
        <Karte
          titel={`${gewaehlt.bezeichnung} · ${gewaehlt.gesellschaft.name} · ${tl.version} ${version.version}`}
          aktionen={
            <Link href={`/gesellschaften/kredite/${gewaehlt.id}`} className="text-sm text-slate-600 hover:underline">
              {tl.zumKredit}
            </Link>
          }
        >
          <p className="mb-3 text-xs text-slate-500">
            {[version.bezeichnung, `${tl.gueltigAb} ${f.datum(version.gueltigAb)}`, `${zeilen.length} ${tl.zeilen}`].filter(Boolean).join(" · ")}
          </p>
          {zeilen.length === 0 ? (
            <Leer>{t.allgemein.keineDaten}</Leer>
          ) : (
            <div className="max-h-[32rem] overflow-y-auto">
              <Tabelle>
                <thead className="sticky top-0 bg-white">
                  <tr>
                    <th>{tl.faelligAm}</th>
                    <th className={rechts}>{tl.rate}</th>
                    <th className={rechts}>{tl.zins}</th>
                    <th className={rechts}>{tl.tilgung}</th>
                    <th className={rechts}>{tl.restschuldPlan}</th>
                  </tr>
                </thead>
                <tbody>
                  {zeilen.map((z) => {
                    const vergangen = isoDatum(z.faelligAm)! < heuteIso;
                    return (
                      <tr key={z.id} className={vergangen ? "text-slate-400" : undefined}>
                        <td className="whitespace-nowrap tabular-nums">{f.datum(z.faelligAm)}</td>
                        <td className={rechts}>{f.betrag(z.rate)}</td>
                        <td className={rechts}>{f.betrag(z.zins)}</td>
                        <td className={rechts}>{f.betrag(z.tilgung)}</td>
                        <td className={rechts}>{f.betrag(z.restschuld)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </Tabelle>
            </div>
          )}
          <p className="mt-2 text-xs text-slate-500">{tl.restschuldPlanHinweis}</p>
        </Karte>
      )}

      <div className="rounded-xl border border-slate-200 bg-white">
        {mitPlan.length === 0 ? (
          <div className="px-5">
            <Leer>{t.allgemein.keineDaten}</Leer>
          </div>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{tl.kredit}</th>
                <th>{tl.gesellschaft}</th>
                <th className={rechts}>{tl.version}</th>
                <th>{tl.gueltigAb}</th>
                <th>{tl.zeitraum}</th>
                <th className={rechts}>{tl.zeilen}</th>
                <th>{tl.naechsteRate}</th>
                <th className={rechts}>{t.allgemein.betrag}</th>
              </tr>
            </thead>
            <tbody>
              {mitPlan.map((k) => {
                const p = k.tilgungsplaene[0];
                const z = zeitraum.get(p.id);
                const naechste = p.zeilen[0];
                return (
                  <tr key={k.id} className="hover:bg-slate-50">
                    <td>
                      <Link href={`/gesellschaften/kredite/${k.id}`} className="font-medium hover:underline">
                        {k.bezeichnung}
                      </Link>
                      <div className="text-xs text-slate-500">{[k.bank, p.bezeichnung].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td>{k.gesellschaft.name}</td>
                    <td className={rechts}>
                      <Link href={filterHref("/tilgungsplaene", { ...filter, v: undefined }, "plan", k.id)} className="hover:underline">
                        {p.version}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap">{f.datum(p.gueltigAb)}</td>
                    <td className="whitespace-nowrap">{z ? `${f.datum(z._min.faelligAm)} – ${f.datum(z._max.faelligAm)}` : t.allgemein.leer}</td>
                    <td className={rechts}>{p._count.zeilen}</td>
                    <td className="whitespace-nowrap">{naechste ? f.datum(naechste.faelligAm) : <span className="text-slate-500">{tl.keineWeitere}</span>}</td>
                    <td className={rechts}>
                      {naechste && (
                        <>
                          {f.betrag(naechste.rate)}
                          <div className="text-xs text-slate-500">
                            {tl.zins} {f.betrag(naechste.zins)} · {tl.tilgung} {f.betrag(naechste.tilgung)}
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Tabelle>
        )}
      </div>

      {ohnePlan.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">{tl.ohnePlan}</h2>
          <ul className="flex flex-wrap gap-2 text-sm">
            {ohnePlan.map((k) => (
              <li key={k.id}>
                <Link href={`/gesellschaften/kredite/${k.id}`} className="rounded bg-slate-100 px-2 py-0.5 hover:bg-slate-200">
                  {k.bezeichnung} · {k.gesellschaft.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
