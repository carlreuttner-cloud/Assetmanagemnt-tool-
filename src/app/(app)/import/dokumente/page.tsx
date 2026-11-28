import Link from "next/link";
import { Karte, Leer, Marke, Seitenkopf, Tabelle, knopfKlasse, rechts } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { dokumentFilter, sucheDokumente } from "@/lib/daten/dateien";
import { einParam } from "@/lib/filter";
import { formatierer } from "@/lib/format";
import { AuswahlFilter, FilterZeile } from "@/components/auswahl-filter";
import { ABSENDER_ARTEN } from "@/lib/dokument-vorschlag";
import { ImportReiter } from "../import-reiter";

export default async function DokumenteSeite({ searchParams }: PageProps<"/import/dokumente">) {
  const kontext = await pruefeZugriff("dokumente");
  const t = texte(kontext.mandant.sprache);
  const td = t.dateien;
  const f = formatierer(kontext.mandant);
  const sp = await searchParams;
  const begriff = (einParam(sp.q) ?? "").trim().slice(0, 100);
  const schreiben = darf(kontext.rolle, "dokumente", "schreiben");
  const sichtFilter = dokumentFilter(await sichtbarkeit(kontext));
  const absender = ABSENDER_ARTEN.find((a) => a === einParam(sp.absender)) ?? null;
  const filter = absender ? { AND: [sichtFilter, { absenderArt: absender }] } : sichtFilter;

  const [treffer, dokumente] = await Promise.all([
    begriff.length >= 2 ? sucheDokumente(kontext, begriff) : Promise.resolve(null),
    kontext.db.dokument.findMany({
      where: filter,
      orderBy: [{ bestaetigt: "asc" }, { erstelltAm: "desc" }],
      take: 300,
      select: {
        id: true,
        titel: true,
        dateiname: true,
        kategorie: true,
        absenderArt: true,
        absenderName: true,
        jahr: true,
        dokumentDatum: true,
        bestaetigt: true,
        textQuelle: true,
        textHinweis: true,
        seitenAnzahl: true,
        erstelltAm: true,
        gesellschaft: { select: { id: true, name: true } },
        haus: { select: { id: true, bezeichnung: true } },
        kredit: { select: { id: true, bezeichnung: true } },
      },
    }),
  ]);
  const offen = dokumente.filter((d) => !d.bestaetigt);
  const fertig = dokumente.filter((d) => d.bestaetigt);
  const q = (seite?: number) => `?q=${encodeURIComponent(begriff)}${seite ? `&seite=${seite}` : ""}`;

  const liste = (eintraege: typeof dokumente) => (
    <Tabelle>
      <thead>
        <tr>
          <th>{td.name}</th>
          <th>{td.kategorie}</th>
          <th>{td.absender}</th>
          <th>{td.zuordnung}</th>
          <th>{td.jahr} / {td.datum}</th>
          <th>{td.text}</th>
          <th className={rechts}>{td.seiten}</th>
          <th>{td.hochgeladen}</th>
        </tr>
      </thead>
      <tbody>
        {eintraege.map((d) => (
          <tr key={d.id} className="hover:bg-slate-50">
            <td>
              <Link href={`/import/dokumente/${d.id}`} className="font-medium hover:underline">
                {d.titel}
              </Link>
              {!d.bestaetigt && (
                <>
                  {" "}
                  <Marke ton="warnung">{td.unbestaetigt}</Marke>
                </>
              )}
              <div className="text-xs text-slate-500">
                {td.original}: {d.dateiname}
              </div>
            </td>
            <td>{d.kategorie ?? "–"}</td>
            <td>
              {d.absenderArt ? td.absenderArten[d.absenderArt] : <span className="italic text-slate-400">{td.keinAbsender}</span>}
              {d.absenderName && <div className="text-xs text-slate-500">{d.absenderName}</div>}
            </td>
            <td>{d.gesellschaft?.name ?? d.haus?.bezeichnung ?? d.kredit?.bezeichnung ?? "–"}</td>
            <td>{d.jahr ?? (d.dokumentDatum ? f.datum(d.dokumentDatum) : "–")}</td>
            <td>
              {d.textQuelle ? td.textQuellen[d.textQuelle] : "–"}
              {d.textHinweis && <div className="text-xs text-amber-700">{fuelle(td.textHinweise[d.textHinweis as keyof typeof td.textHinweise] ?? "", { max: 40 })}</div>}
            </td>
            <td className={rechts}>{d.seitenAnzahl ?? "–"}</td>
            <td className="whitespace-nowrap">{f.datum(d.erstelltAm)}</td>
          </tr>
        ))}
      </tbody>
    </Tabelle>
  );

  return (
    <div className="max-w-6xl space-y-6">
      <Seitenkopf titel={t.navigation.import} beschreibung={td.beschreibung} />
      <ImportReiter kontext={kontext} t={t} aktiv="dokumente" />

      <Karte titel={td.suche}>
        <form method="get" className="flex flex-wrap items-end gap-3" role="search">
          <label className="block min-w-64 flex-1 text-sm">
            <span className="sr-only">{td.suche}</span>
            <input
              name="q"
              type="search"
              defaultValue={begriff}
              placeholder={td.platzhalter}
              className="w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm"
              minLength={2}
            />
          </label>
          <button type="submit" className={knopfKlasse()}>
            {td.suchen}
          </button>
        </form>
        <p className="mt-2 text-xs text-slate-500">{td.sucheHinweis}</p>

        {treffer && (
          <div className="mt-4 space-y-3" data-treffer>
            <p className="text-sm font-medium">
              {treffer.length === 0 ? fuelle(td.keineTreffer, { begriff }) : fuelle(td.treffer, { anzahl: treffer.length, begriff })}
            </p>
            <ul className="space-y-3">
              {treffer.map((d) => (
                <li key={d.id} className="rounded-lg border border-slate-200 p-3">
                  <Link href={`/import/dokumente/${d.id}${q(d.seiten[0]?.nummer)}`} className="font-medium hover:underline">
                    {d.titel}
                  </Link>
                  <span className="ml-2 text-xs text-slate-500">
                    {[d.kategorie, d.objekt, d.imTitel ? td.imNamen : null].filter(Boolean).join(" · ")}
                  </span>
                  <ul className="mt-2 space-y-1">
                    {d.seiten.slice(0, 5).map((s) => (
                      <li key={s.nummer} className="text-sm">
                        <Link href={`/import/dokumente/${d.id}${q(s.nummer)}`} className="text-xs font-medium text-sky-700 hover:underline">
                          {fuelle(td.fundstellen, { anzahl: s.anzahl, nummer: s.nummer })}
                        </Link>
                        {s.ausschnitt && (
                          <span className="ml-2 text-slate-600">
                            {s.ausschnitt.vor}
                            <mark className="rounded bg-yellow-200 px-0.5">{s.ausschnitt.treffer}</mark>
                            {s.ausschnitt.nach}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Karte>

      {schreiben && (
        <Karte titel={td.hochladen}>
          <p className="text-sm text-slate-600">
            {t.eingang.zumImport}{" "}
            <Link href="/posteingang" className="font-medium text-sky-700 hover:underline">
              {t.eingang.zumPosteingang} →
            </Link>
          </p>
        </Karte>
      )}

      {offen.length > 0 && (
        <Karte titel={td.zuBestaetigen}>
          <p className="mb-3 text-sm text-slate-600">{td.zuBestaetigenHinweis}</p>
          {liste(offen)}
        </Karte>
      )}

      <Karte titel={td.alle}>
        <FilterZeile>
          <AuswahlFilter
            name="absender"
            label={td.absenderFilter}
            optionen={[
              { href: "/import/dokumente", text: td.alleAbsender, aktiv: !absender },
              ...ABSENDER_ARTEN.map((a) => ({ href: `/import/dokumente?absender=${a}`, text: td.absenderArten[a], aktiv: absender === a })),
            ]}
          />
        </FilterZeile>
        {fertig.length === 0 ? <Leer>{td.keine}</Leer> : liste(fertig)}
      </Karte>
    </div>
  );
}
