import Link from "next/link";
import { Leer, Reiter, Seitenkopf, Tabelle, rechts } from "@/components/ui";
import { texte } from "@/i18n";
import { bereichsSicht } from "@/lib/auth/auswahl";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { alsDbDatum, heute } from "@/lib/datum";
import { erlaubt } from "@/lib/daten/portfolio";
import { einParam, filterHref } from "@/lib/filter";
import { formatierer } from "@/lib/format";

export default async function TilgungsplaeneSeite({ searchParams }: PageProps<"/tilgungsplaene">) {
  const sp = await searchParams;
  const kontext = await pruefeZugriff("gesellschaften");
  const t = texte(kontext.mandant.sprache);
  const f = formatierer(kontext.mandant);
  const tl = t.listen;
  const filter = { g: einParam(sp.g) };
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

  return (
    <div className="space-y-4">
      <Seitenkopf titel={t.navigation.tilgungsplaene} beschreibung={t.seiten.tilgungsplaene} />
      {gesellschaften.length > 1 && (
        <Reiter
          eintraege={[
            { href: filterHref("/tilgungsplaene", filter, "g", undefined), text: tl.alleGesellschaften, aktiv: !filter.g },
            ...gesellschaften.map((g) => ({ href: filterHref("/tilgungsplaene", filter, "g", g.id), text: g.name, aktiv: filter.g === g.id })),
          ]}
        />
      )}
      <p className="text-sm text-slate-600">{tl.planHinweis}</p>

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
                    <td className={rechts}>{p.version}</td>
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
