import Link from "next/link";
import { KnopfLink, Leer, MieteZelle, Seitenkopf, Tabelle, rechts } from "@/components/ui";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { heute } from "@/lib/datum";
import { erlaubt, ladeRechengrundlage } from "@/lib/daten/portfolio";
import { formatierer } from "@/lib/format";
import { gruppenKennzahlen, hausKennzahlen } from "@/lib/kennzahlen";

export default async function HaeuserSeite({ searchParams }: PageProps<"/haeuser">) {
  const { gesellschaft } = await searchParams;
  const kontext = await pruefeZugriff("haeuser");
  const t = texte(kontext.mandant.sprache);
  const f = formatierer(kontext.mandant);
  const stichtag = heute();
  const filter = typeof gesellschaft === "string" && gesellschaft ? gesellschaft : undefined;

  const grundlage = await ladeRechengrundlage(kontext);
  const [haeuser, gesellschaften] = await Promise.all([
    kontext.db.haus.findMany({
      where: { id: erlaubt(grundlage.sicht.hausIds), gesellschaftId: filter },
      orderBy: [{ ort: "asc" }, { bezeichnung: "asc" }],
      include: { gesellschaft: { select: { name: true } } },
    }),
    kontext.db.gesellschaft.findMany({
      where: { id: erlaubt(grundlage.sicht.gesellschaftIds) },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const { kredite, referenzwerte } = grundlage;
  const daten = new Map(grundlage.haeuser.map((h) => [h.id, h]));
  const zeilen = haeuser.map((h) => ({ h, k: hausKennzahlen(daten.get(h.id)!, kredite, referenzwerte, stichtag) }));
  // Summenzeile: Häuser plus anteilige Kredite (über die Häuser summiert)
  const summe = gruppenKennzahlen(haeuser.map((h) => daten.get(h.id)!), [], referenzwerte, stichtag);
  const restschuld = zeilen.reduce((s, z) => s.plus(z.k.restschuld), summe.restschuld);
  const schreiben = darf(kontext.rolle, "haeuser", "schreiben");
  const tk = t.kennzahlen;

  return (
    <div>
      <Seitenkopf
        titel={t.haeuser.titel}
        beschreibung={t.seiten.haeuser}
        aktionen={schreiben && <KnopfLink href={`/haeuser/neu${filter ? `?gesellschaft=${filter}` : ""}`} art="primaer">{t.haeuser.neu}</KnopfLink>}
      />

      {gesellschaften.length > 1 && (
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          <FilterLink href="/haeuser" aktiv={!filter} text={t.haeuser.alleGesellschaften} />
          {gesellschaften.map((g) => (
            <FilterLink key={g.id} href={`/haeuser?gesellschaft=${g.id}`} aktiv={filter === g.id} text={g.name} />
          ))}
        </div>
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
                <th>{t.haeuser.bezeichnung}</th>
                <th className={rechts}>{tk.einheiten}</th>
                <th className={rechts}>{tk.flaeche}</th>
                <th className={rechts}>{tk.verkehrswert}</th>
                <th className={rechts}>{tk.restschuld}</th>
                <th className={rechts}>{tk.ltv}</th>
                <th className={rechts}>
                  {tk.sollMiete} ({t.allgemein.monat} / {t.allgemein.jahr})
                </th>
                <th className={rechts}>
                  {tk.istMiete} ({t.allgemein.monat} / {t.allgemein.jahr})
                </th>
                <th className={rechts}>{tk.leerstand}</th>
              </tr>
            </thead>
            <tbody>
              {zeilen.map(({ h, k }) => (
                <tr key={h.id} className="hover:bg-slate-50">
                  <td>
                    <Link href={`/haeuser/${h.id}`} className="font-medium hover:underline">
                      {h.bezeichnung}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {[h.plz, h.ort].filter(Boolean).join(" ")} · {h.gesellschaft.name}
                    </div>
                  </td>
                  <td className={rechts}>
                    {k.einheiten}
                    {k.leereEinheiten > 0 && <div className="text-xs text-slate-500">{k.leereEinheiten} {t.haeuser.leer}</div>}
                  </td>
                  <td className={rechts}>{f.zahl(k.flaeche)} m²</td>
                  <td className={rechts}>{f.betragGanz(k.verkehrswert)}</td>
                  <td className={rechts}>{f.betragGanz(k.restschuld)}</td>
                  <td className={rechts}>{f.prozent(k.ltv, 1)}</td>
                  <td className={rechts}>
                    <MieteZelle monat={f.betrag(k.sollMonat)} jahr={f.betrag(k.sollJahr)} />
                  </td>
                  <td className={rechts}>
                    <MieteZelle monat={f.betrag(k.istMonat)} jahr={f.betrag(k.istJahr)} />
                  </td>
                  <td className={rechts}>{f.prozent(k.leerstandQuote, 1)}</td>
                </tr>
              ))}
            </tbody>
            {zeilen.length > 1 && (
              <tfoot>
                <tr>
                  <td>{t.allgemein.summe}</td>
                  <td className={rechts}>{summe.einheiten}</td>
                  <td className={rechts}>{f.zahl(summe.flaeche)} m²</td>
                  <td className={rechts}>{f.betragGanz(summe.verkehrswert)}</td>
                  <td className={rechts}>{f.betragGanz(restschuld)}</td>
                  <td className={rechts}>{f.prozent(summe.verkehrswert.isZero() ? null : restschuld.times(100).dividedBy(summe.verkehrswert), 1)}</td>
                  <td className={rechts}>
                    <MieteZelle monat={f.betrag(summe.sollMonat)} jahr={f.betrag(summe.sollJahr)} />
                  </td>
                  <td className={rechts}>
                    <MieteZelle monat={f.betrag(summe.istMonat)} jahr={f.betrag(summe.istJahr)} />
                  </td>
                  <td className={rechts}>{f.prozent(summe.leerstandQuote, 1)}</td>
                </tr>
              </tfoot>
            )}
          </Tabelle>
        )}
      </div>
    </div>
  );
}

function FilterLink({ href, aktiv, text }: { href: string; aktiv: boolean; text: string }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1 ring-1 ring-inset ${aktiv ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"}`}
    >
      {text}
    </Link>
  );
}
