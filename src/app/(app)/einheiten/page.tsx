import Link from "next/link";
import { Leer, Marke, MieteZelle, Reiter, Seitenkopf, Tabelle, rechts } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { bereichsSicht } from "@/lib/auth/auswahl";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { heute, isoDatum } from "@/lib/datum";
import { erlaubt } from "@/lib/daten/portfolio";
import { einParam, filterHref } from "@/lib/filter";
import { formatierer } from "@/lib/format";
import { dezimal } from "@/lib/geld";
import { istAktiv } from "@/lib/kennzahlen";

export default async function EinheitenSeite({ searchParams }: PageProps<"/einheiten">) {
  const sp = await searchParams;
  const kontext = await pruefeZugriff("haeuser");
  const t = texte(kontext.mandant.sprache);
  const f = formatierer(kontext.mandant);
  const tl = t.listen;
  const stichtag = heute();
  const filter = { g: einParam(sp.g), h: einParam(sp.h), status: einParam(sp.status) };
  const sicht = await bereichsSicht(kontext);
  const darfMieter = darf(kontext.rolle, "mieter");

  const [haeuser, einheiten] = await Promise.all([
    kontext.db.haus.findMany({
      where: { id: erlaubt(sicht.hausIds), gesellschaftId: filter.g },
      orderBy: { bezeichnung: "asc" },
      select: { id: true, bezeichnung: true, gesellschaft: { select: { id: true, name: true } } },
    }),
    kontext.db.einheit.findMany({
      where: { hausId: erlaubt(sicht.hausIds, filter.h), haus: filter.g ? { gesellschaftId: filter.g } : undefined },
      orderBy: [{ haus: { bezeichnung: "asc" } }, { bezeichnung: "asc" }],
      include: {
        haus: { select: { id: true, bezeichnung: true, gesellschaft: { select: { name: true } } } },
        mietverhaeltnisse: { include: { mieter: { select: { name: true } } } },
      },
    }),
  ]);
  const gesellschaften = [...new Map(haeuser.map((h) => [h.gesellschaft.id, h.gesellschaft])).values()].sort((a, b) => a.name.localeCompare(b.name));

  const alleZeilen = einheiten.map((e) => {
    const aktiv = e.mietverhaeltnisse.filter((m) => istAktiv({ beginn: isoDatum(m.beginn), ende: isoDatum(m.ende) }, stichtag));
    return { e, aktiv, soll: aktiv.reduce((s, m) => s.plus(dezimal(m.sollMiete)), dezimal(0)), leer: aktiv.length === 0 };
  });
  const zeilen = filter.status === "leer" ? alleZeilen.filter((z) => z.leer) : alleZeilen;
  const flaeche = zeilen.reduce((s, z) => s.plus(dezimal(z.e.flaeche)), dezimal(0));
  const sollVermietet = zeilen.filter((z) => !z.leer).reduce((s, z) => s.plus(z.soll), dezimal(0));
  const leere = zeilen.filter((z) => z.leer);
  const erwartet = leere.reduce((s, z) => (z.e.erwarteteMiete ? s.plus(dezimal(z.e.erwarteteMiete)) : s), dezimal(0));
  const ohneErwartet = leere.filter((z) => !z.e.erwarteteMiete).length;

  return (
    <div>
      <Seitenkopf titel={t.navigation.einheiten} beschreibung={t.seiten.einheiten} />
      {gesellschaften.length > 1 && (
        <Reiter
          eintraege={[
            { href: filterHref("/einheiten", { ...filter, h: undefined }, "g", undefined), text: tl.alleGesellschaften, aktiv: !filter.g },
            ...gesellschaften.map((g) => ({ href: filterHref("/einheiten", { ...filter, h: undefined }, "g", g.id), text: g.name, aktiv: filter.g === g.id })),
          ]}
        />
      )}
      {haeuser.length > 1 && (
        <Reiter
          eintraege={[
            { href: filterHref("/einheiten", filter, "h", undefined), text: tl.alleHaeuser, aktiv: !filter.h },
            ...haeuser.map((h) => ({ href: filterHref("/einheiten", filter, "h", h.id), text: h.bezeichnung, aktiv: filter.h === h.id })),
          ]}
        />
      )}
      <Reiter
        eintraege={[
          { href: filterHref("/einheiten", filter, "status", undefined), text: t.allgemein.alle, aktiv: !filter.status },
          { href: filterHref("/einheiten", filter, "status", "leer"), text: tl.nurLeer, aktiv: filter.status === "leer" },
        ]}
      />

      <div className="rounded-xl border border-slate-200 bg-white">
        {zeilen.length === 0 ? (
          <div className="px-5">
            <Leer>{t.allgemein.keineDaten}</Leer>
          </div>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{tl.einheit}</th>
                <th>{tl.haus}</th>
                <th>{t.einheiten.lage}</th>
                <th className={rechts}>{t.einheiten.flaeche}</th>
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
                    <div className="text-xs font-normal text-slate-500">{t.einheitArten[e.art]}</div>
                  </td>
                  <td>
                    <Link href={`/haeuser/${e.haus.id}#einheiten`} className="hover:underline">
                      {e.haus.bezeichnung}
                    </Link>
                    <div className="text-xs text-slate-500">{e.haus.gesellschaft.name}</div>
                  </td>
                  <td>{e.lage}</td>
                  <td className={rechts}>{f.zahl(e.flaeche, 1)}</td>
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
                <tr>
                  <td colSpan={3}>
                    {t.allgemein.summe} ({zeilen.length})
                  </td>
                  <td className={rechts}>{f.zahl(flaeche, 1)}</td>
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
