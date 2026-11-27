import Link from "next/link";
import { RestschuldWert, ZinssatzWert } from "@/components/herleitung";
import { ZinsbindungMarke } from "@/components/kredit-marken";
import { KnopfLink, Leer, Reiter, Seitenkopf, Tabelle, rechts } from "@/components/ui";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { heute } from "@/lib/datum";
import { erlaubt, ladeRechengrundlage } from "@/lib/daten/portfolio";
import { einParam, filterHref } from "@/lib/filter";
import { formatierer } from "@/lib/format";
import { restschuldNachweis, zinsbindung } from "@/lib/kredit";

const ZINSARTEN = ["FEST", "VARIABEL"] as const;

export default async function KrediteSeite({ searchParams }: PageProps<"/kredite">) {
  const sp = await searchParams;
  const kontext = await pruefeZugriff("gesellschaften");
  const t = texte(kontext.mandant.sprache);
  const f = formatierer(kontext.mandant);
  const tl = t.listen;
  const tk = t.kredite;
  const stichtag = heute();
  const zinsArt = ZINSARTEN.find((z) => z === sp.zins);
  const filter = { g: einParam(sp.g), zins: zinsArt };

  const { kredite: daten, referenzwerte, sicht } = await ladeRechengrundlage(kontext, { bereich: true });
  const [gesellschaften, kredite] = await Promise.all([
    kontext.db.gesellschaft.findMany({ where: { id: erlaubt(sicht.gesellschaftIds) }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    kontext.db.kredit.findMany({
      where: { gesellschaftId: erlaubt(sicht.gesellschaftIds, filter.g), zinsArt },
      orderBy: [{ gesellschaft: { name: "asc" } }, { bezeichnung: "asc" }],
      select: {
        id: true,
        bezeichnung: true,
        bank: true,
        kreditnummer: true,
        iban: true,
        zinsArt: true,
        referenzzins: true,
        ursprungsbetrag: true,
        gesellschaft: { select: { id: true, name: true } },
      },
    }),
  ]);
  const nachId = new Map(daten.map((k) => [k.id, k]));
  const schreiben = darf(kontext.rolle, "gesellschaften", "schreiben");

  return (
    <div>
      <Seitenkopf
        titel={t.navigation.kredite}
        beschreibung={t.seiten.kredite}
        aktionen={
          schreiben && (
            <KnopfLink href={`/gesellschaften/kredite/neu${filter.g ? `?gesellschaft=${filter.g}` : ""}`} art="primaer">
              {tk.neu}
            </KnopfLink>
          )
        }
      />
      {gesellschaften.length > 1 && (
        <Reiter
          eintraege={[
            { href: filterHref("/kredite", filter, "g", undefined), text: tl.alleGesellschaften, aktiv: !filter.g },
            ...gesellschaften.map((g) => ({ href: filterHref("/kredite", filter, "g", g.id), text: g.name, aktiv: filter.g === g.id })),
          ]}
        />
      )}
      <Reiter
        eintraege={[
          { href: filterHref("/kredite", filter, "zins", undefined), text: tl.alleZinsarten, aktiv: !filter.zins },
          ...ZINSARTEN.map((z) => ({ href: filterHref("/kredite", filter, "zins", z), text: t.zinsArten[z], aktiv: filter.zins === z })),
        ]}
      />

      <div className="rounded-xl border border-slate-200 bg-white">
        {kredite.length === 0 ? (
          <div className="px-5">
            <Leer>{t.allgemein.keineDaten}</Leer>
          </div>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{tk.bezeichnung}</th>
                <th>{tl.gesellschaft}</th>
                <th>{tk.bank}</th>
                <th>{tk.iban}</th>
                <th>{tk.zinsArt}</th>
                <th className={rechts}>{tk.ursprungsbetrag}</th>
                <th className={rechts}>{tk.zinssatzAktuell}</th>
                <th className={rechts}>{tl.belegteRestschuld}</th>
                <th>{tk.zinsbindung}</th>
              </tr>
            </thead>
            <tbody>
              {kredite.map((k) => {
                const d = nachId.get(k.id);
                return (
                  <tr key={k.id} className="hover:bg-slate-50">
                    <td>
                      <Link href={`/gesellschaften/kredite/${k.id}`} className="font-medium hover:underline">
                        {k.bezeichnung}
                      </Link>
                      {k.kreditnummer && <div className="text-xs text-slate-500">{k.kreditnummer}</div>}
                    </td>
                    <td>
                      <Link href={`/gesellschaften/${k.gesellschaft.id}`} className="hover:underline">
                        {k.gesellschaft.name}
                      </Link>
                    </td>
                    <td>{k.bank}</td>
                    <td className="whitespace-nowrap font-mono text-xs">{k.iban}</td>
                    <td>
                      {t.zinsArten[k.zinsArt]}
                      {k.referenzzins && <div className="text-xs text-slate-500">{k.referenzzins}</div>}
                    </td>
                    <td className={rechts}>{f.betrag(k.ursprungsbetrag)}</td>
                    <td className={rechts}>{d && <ZinssatzWert k={d} referenzwerte={referenzwerte} stichtag={stichtag} t={t} f={f} />}</td>
                    <td className={rechts}>{d && <RestschuldWert nachweis={restschuldNachweis(d, stichtag)} t={t} f={f} />}</td>
                    <td>{d && <ZinsbindungMarke zb={zinsbindung(d, stichtag)} t={t} f={f} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </Tabelle>
        )}
      </div>
    </div>
  );
}
