import Link from "next/link";
import { AuswahlFilter, FilterZeile } from "@/components/auswahl-filter";
import { Begriff, Kennzahl } from "@/components/herleitung";
import { LeerstandZelle, NutzungsartPunkt } from "@/components/nutzungsart";
import { KnopfLink, Leer, MieteZelle, Reiter, Seitenkopf, Tabelle, rechts } from "@/components/ui";
import { texte, type Texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { heute } from "@/lib/datum";
import { ladeHausverwaltungen, ladeZuordnungen, passtZuHv, verwaltungJeHaus } from "@/lib/daten/hausverwaltung";
import { erlaubt, ladeRechengrundlage } from "@/lib/daten/portfolio";
import { formatierer, type Formatierer } from "@/lib/format";
import { addiere, hausKennzahlen, kennzahlenAus, leereSummen, type Kennzahlen, type Summen } from "@/lib/kennzahlen";
import { NUTZUNGSARTEN, nutzungsartAus, type Nutzungsart } from "@/lib/nutzungsart";
import { hvOptionen } from "../hausverwaltungen/ton";

export default async function HaeuserSeite({ searchParams }: PageProps<"/haeuser">) {
  const { gesellschaft, art: artParam, hv: hvParam, sort: sortParam } = await searchParams;
  const hv = typeof hvParam === "string" && hvParam ? hvParam : undefined;
  const sort = sortParam === "hv" ? "hv" : undefined;
  const art = nutzungsartAus(artParam);
  const kontext = await pruefeZugriff("haeuser");
  const t = texte(kontext.mandant.sprache);
  const f = formatierer(kontext.mandant);
  const stichtag = heute();
  const filter = typeof gesellschaft === "string" && gesellschaft ? gesellschaft : undefined;

  const grundlage = await ladeRechengrundlage(kontext, { bereich: true });
  const [haeuser, gesellschaften, zuordnungen, verwaltungen] = await Promise.all([
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
    ladeZuordnungen(kontext),
    ladeHausverwaltungen(kontext),
  ]);
  const hvJeHaus = verwaltungJeHaus(zuordnungen, stichtag);
  const { kredite, referenzwerte } = grundlage;
  const daten = new Map(grundlage.haeuser.map((h) => [h.id, h]));
  const zeilen = haeuser
    .map((h) => ({ h, k: hausKennzahlen(daten.get(h.id)!, kredite, referenzwerte, stichtag) }))
    // Filter Nutzungsart: nur Häuser, die Einheiten dieser Art haben
    .filter((z) => !art || z.k.nachArt[art].einheiten > 0)
    .filter((z) => passtZuHv(hv, hvJeHaus.get(z.h.id)));
  // Sortierung nach Hausverwaltung: Häuser ohne Hausverwaltung zuletzt
  if (sort === "hv") zeilen.sort((a, b) => (hvJeHaus.get(a.h.id)?.name ?? "\uffff").localeCompare(hvJeHaus.get(b.h.id)?.name ?? "\uffff", "de") || a.h.bezeichnung.localeCompare(b.h.bezeichnung, "de"));
  const href = (werte: { gesellschaft?: string; art?: Nutzungsart; hv?: string; sort?: string }) => {
    const p = new URLSearchParams();
    for (const [k, w] of Object.entries(werte)) if (w) p.set(k, w);
    const q = p.toString();
    return q ? `/haeuser?${q}` : "/haeuser";
  };
  const aktuell = { gesellschaft: filter, art, hv, sort };
  const th = t.hausverwaltungen;
  // Summenzeile: Häuser plus anteilige Kredite (über die Häuser summiert)
  const summe = kennzahlenAus(zeilen.reduce<Summen>((s, z) => addiere(s, z.k), leereSummen()));
  const schreiben = darf(kontext.rolle, "haeuser", "schreiben");
  const tk = t.kennzahlen;

  return (
    <div>
      <Seitenkopf
        titel={t.haeuser.titel}
        beschreibung={t.seiten.haeuser}
        aktionen={schreiben && <KnopfLink href={`/haeuser/neu${filter ? `?gesellschaft=${filter}` : ""}`} art="primaer">{t.haeuser.neu}</KnopfLink>}
      />

      {(gesellschaften.length > 1 || verwaltungen.length > 0) && (
        <FilterZeile>
          {gesellschaften.length > 1 && (
            <AuswahlFilter
              name="gesellschaft"
              label={t.listen.gesellschaft}
              optionen={[
                { href: href({ ...aktuell, gesellschaft: undefined }), text: t.haeuser.alleGesellschaften, aktiv: !filter },
                ...gesellschaften.map((g) => ({ href: href({ ...aktuell, gesellschaft: g.id }), text: g.name, aktiv: filter === g.id })),
              ]}
            />
          )}
          {verwaltungen.length > 0 && (
            <>
              <AuswahlFilter name="hv" label={th.filter} optionen={hvOptionen(verwaltungen, hv, (w) => href({ ...aktuell, hv: w }), t)} />
              <AuswahlFilter
                name="sort"
                label={th.sortierung}
                optionen={[
                  { href: href({ ...aktuell, sort: undefined }), text: th.sortStandard, aktiv: !sort },
                  { href: href({ ...aktuell, sort: "hv" }), text: th.sortHv, aktiv: sort === "hv" },
                ]}
              />
            </>
          )}
        </FilterZeile>
      )}
      <Reiter
        eintraege={[
          { href: href({ ...aktuell, art: undefined }), text: t.nutzung.alle, aktiv: !art },
          ...NUTZUNGSARTEN.map((a) => ({
            href: href({ ...aktuell, art: a }),
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
                <FlaechenKopf t={t} />
                <th className={rechts}>{tk.verkehrswert}</th>
                <th className={rechts}>{tk.restschuld}</th>
                <th className={rechts}>
                  <Begriff k="LTV" t={t} />
                </th>
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
                    {hvJeHaus.get(h.id) && (
                      <div className="text-xs text-slate-500" data-hv={hvJeHaus.get(h.id)!.name}>
                        {th.kurz}:{" "}
                        <Link href={`/hausverwaltungen/${hvJeHaus.get(h.id)!.id}`} className="hover:underline">
                          {hvJeHaus.get(h.id)!.name}
                        </Link>
                      </div>
                    )}
                  </td>
                  <td className={rechts}>
                    {k.einheiten}
                    {k.leereEinheiten > 0 && <div className="text-xs text-slate-500">{k.leereEinheiten} {t.haeuser.leer}</div>}
                  </td>
                  <FlaechenZellen k={k} f={f} t={t} />
                  <td className={rechts}>
                    <Kennzahl art="verkehrswert" k={k} t={t} f={f} stichtag={stichtag} ganz ausrichtung="rechts" />
                  </td>
                  <td className={rechts}>
                    <Kennzahl art="restschuld" k={k} t={t} f={f} stichtag={stichtag} ganz ausrichtung="rechts" />
                  </td>
                  <td className={rechts}>
                    <Kennzahl art="ltv" k={k} t={t} f={f} stichtag={stichtag} ausrichtung="rechts" />
                  </td>
                  <td className={rechts}>
                    <MieteZelle monat={f.betrag(k.sollMonat)} jahr={f.betrag(k.sollJahr)} />
                  </td>
                  <td className={rechts}>
                    <MieteZelle monat={f.betrag(k.istMonat)} jahr={f.betrag(k.istJahr)} />
                  </td>
                  <td className={rechts}>
                    <LeerstandZelle quote={f.prozent(k.leerstandQuote, 1)} nachArt={k.nachArt} t={t} f={f} />
                  </td>
                </tr>
              ))}
            </tbody>
            {zeilen.length > 1 && (
              <tfoot>
                <tr>
                  <td>{t.allgemein.summe}</td>
                  <td className={rechts}>{summe.einheiten}</td>
                  <FlaechenZellen k={summe} f={f} t={t} />
                  <td className={rechts}>
                    <Kennzahl art="verkehrswert" k={summe} t={t} f={f} stichtag={stichtag} ganz ausrichtung="rechts" />
                  </td>
                  <td className={rechts}>
                    <Kennzahl art="restschuld" k={summe} t={t} f={f} stichtag={stichtag} ganz ausrichtung="rechts" />
                  </td>
                  <td className={rechts}>
                    <Kennzahl art="ltv" k={summe} t={t} f={f} stichtag={stichtag} ausrichtung="rechts" />
                  </td>
                  <td className={rechts}>
                    <MieteZelle monat={f.betrag(summe.sollMonat)} jahr={f.betrag(summe.sollJahr)} />
                  </td>
                  <td className={rechts}>
                    <MieteZelle monat={f.betrag(summe.istMonat)} jahr={f.betrag(summe.istJahr)} />
                  </td>
                  <td className={rechts}>
                    <LeerstandZelle quote={f.prozent(summe.leerstandQuote, 1)} nachArt={summe.nachArt} t={t} f={f} />
                  </td>
                </tr>
              </tfoot>
            )}
          </Tabelle>
        )}
      </div>
    </div>
  );
}

/** Spaltenköpfe Wohnfläche, Gewerbefläche (m²) und Stellplätze (Stück), mit Farbpunkt. */
function FlaechenKopf({ t }: { t: Texte }) {
  const kopf: Array<[Nutzungsart, string]> = [
    ["WOHNUNG", `${t.nutzung.wohnflaeche} (m²)`],
    ["GEWERBE", `${t.nutzung.gewerbeflaeche} (m²)`],
    ["STELLPLATZ", `${t.nutzung.stellplaetze} (${t.nutzung.stueck})`],
  ];
  return (
    <>
      {kopf.map(([a, text]) => (
        <th key={a} className={rechts}>
          <span className="inline-flex items-center gap-1.5">
            <NutzungsartPunkt art={a} />
            {text}
          </span>
        </th>
      ))}
    </>
  );
}

/** Fläche je Nutzungsart; leer vermietete Anteile klein darunter. Keine Einheiten der Art: „–“. */
function FlaechenZellen({ k, f, t }: { k: Kennzahlen; f: Formatierer; t: Texte }) {
  return (
    <>
      {NUTZUNGSARTEN.map((a) => {
        const x = k.nachArt[a];
        if (x.einheiten === 0) return <td key={a} className={`${rechts} text-slate-400`}>–</td>;
        const stellplatz = a === "STELLPLATZ";
        return (
          <td key={a} className={rechts}>
            {stellplatz ? x.einheiten : f.zahl(x.flaeche)}
            {x.leereEinheiten > 0 && (
              <div className="text-xs text-slate-500">
                {stellplatz ? x.leereEinheiten : f.zahl(x.leerFlaeche)} {t.nutzung.leer}
              </div>
            )}
          </td>
        );
      })}
    </>
  );
}
