import Link from "next/link";
import { Leer, Reiter, Seitenkopf, Tabelle, rechts } from "@/components/ui";
import { texte } from "@/i18n";
import { bereichsSicht } from "@/lib/auth/auswahl";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { erlaubt } from "@/lib/daten/portfolio";
import { einParam, filterHref } from "@/lib/filter";
import { formatierer } from "@/lib/format";
import { dezimal } from "@/lib/geld";

export default async function InvestitionenSeite({ searchParams }: PageProps<"/investitionen">) {
  const sp = await searchParams;
  const kontext = await pruefeZugriff("haeuser");
  const t = texte(kontext.mandant.sprache);
  const f = formatierer(kontext.mandant);
  const tl = t.listen;
  const filter = { g: einParam(sp.g), h: einParam(sp.h), kat: einParam(sp.kat) };
  const sicht = await bereichsSicht(kontext);

  const [haeuser, alle] = await Promise.all([
    kontext.db.haus.findMany({
      where: { id: erlaubt(sicht.hausIds), gesellschaftId: filter.g },
      orderBy: { bezeichnung: "asc" },
      select: { id: true, bezeichnung: true, gesellschaft: { select: { id: true, name: true } } },
    }),
    kontext.db.investition.findMany({
      where: { hausId: erlaubt(sicht.hausIds, filter.h), haus: filter.g ? { gesellschaftId: filter.g } : undefined },
      orderBy: { datum: "desc" },
      include: {
        haus: { select: { id: true, bezeichnung: true, gesellschaft: { select: { name: true } } } },
        einheit: { select: { bezeichnung: true } },
      },
    }),
  ]);
  const gesellschaften = [...new Map(haeuser.map((h) => [h.gesellschaft.id, h.gesellschaft])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const kategorien = [...new Set(alle.map((i) => i.kategorie ?? ""))].sort();
  const OHNE = "-";
  const zeilen = filter.kat ? alle.filter((i) => (i.kategorie || OHNE) === filter.kat) : alle;
  const summe = zeilen.reduce((s, i) => s.plus(dezimal(i.betrag)), dezimal(0));

  return (
    <div>
      <Seitenkopf titel={t.navigation.investitionen} beschreibung={t.seiten.investitionen} />
      {gesellschaften.length > 1 && (
        <Reiter
          eintraege={[
            { href: filterHref("/investitionen", { ...filter, h: undefined }, "g", undefined), text: tl.alleGesellschaften, aktiv: !filter.g },
            ...gesellschaften.map((g) => ({ href: filterHref("/investitionen", { ...filter, h: undefined }, "g", g.id), text: g.name, aktiv: filter.g === g.id })),
          ]}
        />
      )}
      {haeuser.length > 1 && (
        <Reiter
          eintraege={[
            { href: filterHref("/investitionen", filter, "h", undefined), text: tl.alleHaeuser, aktiv: !filter.h },
            ...haeuser.map((h) => ({ href: filterHref("/investitionen", filter, "h", h.id), text: h.bezeichnung, aktiv: filter.h === h.id })),
          ]}
        />
      )}
      {kategorien.length > 1 && (
        <Reiter
          eintraege={[
            { href: filterHref("/investitionen", filter, "kat", undefined), text: t.allgemein.alle, aktiv: !filter.kat },
            ...kategorien.map((k) => ({ href: filterHref("/investitionen", filter, "kat", k || OHNE), text: k || tl.ohneKategorie, aktiv: filter.kat === (k || OHNE) })),
          ]}
        />
      )}

      <div className="rounded-xl border border-slate-200 bg-white">
        {zeilen.length === 0 ? (
          <div className="px-5">
            <Leer>{t.allgemein.keineDaten}</Leer>
          </div>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{t.allgemein.datum}</th>
                <th>{tl.haus}</th>
                <th>{tl.einheit}</th>
                <th>{tl.kategorie}</th>
                <th>{t.allgemein.bezeichnung}</th>
                <th className={rechts}>{t.allgemein.betrag}</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map((i) => (
                <tr key={i.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap">{f.datum(i.datum)}</td>
                  <td>
                    <Link href={`/haeuser/${i.haus.id}`} className="hover:underline">
                      {i.haus.bezeichnung}
                    </Link>
                    <div className="text-xs text-slate-500">{i.haus.gesellschaft.name}</div>
                  </td>
                  <td>{i.einheit?.bezeichnung}</td>
                  <td>{i.kategorie ?? <span className="text-slate-400">{tl.ohneKategorie}</span>}</td>
                  <td>{i.beschreibung}</td>
                  <td className={rechts}>{f.betrag(i.betrag)}</td>
                </tr>
              ))}
            </tbody>
            {zeilen.length > 1 && (
              <tfoot>
                <tr>
                  <td colSpan={5}>
                    {t.allgemein.summe} ({zeilen.length})
                  </td>
                  <td className={rechts}>{f.betrag(summe)}</td>
                </tr>
              </tfoot>
            )}
          </Tabelle>
        )}
      </div>
    </div>
  );
}
