import Link from "next/link";
import { Fragment } from "react";
import { Formular } from "@/components/formular";
import { Auswahl, Feld, Felder, Karte, Leer, Marke, Seitenkopf, Tabelle, Textfeld, knopfKlasse } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { bereichsSicht } from "@/lib/auth/auswahl";
import { idFilter } from "@/lib/auth/sichtbarkeit";
import { heute, isoDatum } from "@/lib/datum";
import { formatierer } from "@/lib/format";
import { PLATZHALTER } from "@/lib/serienbrief";
import { vorlageLoeschen, vorlageSpeichern } from "./aktionen";

export default async function SerienbriefeSeite({ searchParams }: PageProps<"/serienbriefe">) {
  const kontext = await pruefeZugriff("mieter");
  const t = texte(kontext.mandant.sprache);
  const ts = t.serienbriefe;
  const f = formatierer(kontext.mandant);
  const sp = await searchParams;
  const schreiben = darf(kontext.rolle, "mieter", "schreiben");
  const sicht = await bereichsSicht(kontext);
  const [vorlagen, haeuser, serien] = await Promise.all([
    kontext.db.briefvorlage.findMany({ orderBy: { name: "asc" } }),
    kontext.db.haus.findMany({ where: { id: idFilter(sicht.hausIds) }, orderBy: { bezeichnung: "asc" }, select: { id: true, bezeichnung: true, gesellschaftId: true, gesellschaft: { select: { name: true } } } }),
    kontext.db.briefserie.findMany({
      orderBy: { erstelltAm: "desc" },
      take: 20,
      include: { dokumente: { where: { hausId: idFilter(sicht.hausIds) }, select: { id: true, titel: true }, orderBy: { titel: "asc" } } },
    }),
  ]);
  const gesellschaften = [...new Map(haeuser.map((h) => [h.gesellschaftId, h.gesellschaft.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const neu = typeof sp.serie === "string" ? serien.find((s) => s.id === sp.serie) : undefined;

  const vorlageFelder = (v?: (typeof vorlagen)[number]) => (
    <Felder>
      {v && <input type="hidden" name="id" value={v.id} />}
      <Feld name="name" label={ts.name} wert={v?.name} pflicht />
      <Auswahl name="art" label={ts.art} optionen={(["MIETERHOEHUNG", "ALLGEMEIN"] as const).map((a) => ({ wert: a, text: ts.arten[a] }))} wert={v?.art} pflicht />
      <Feld name="betreff" label={ts.betreff} wert={v?.betreff} pflicht breit />
      <Textfeld name="text" label={ts.text} wert={v?.text} />
      <p className="text-xs text-slate-500 sm:col-span-2">{ts.textHinweis}</p>
    </Felder>
  );

  return (
    <div className="max-w-6xl space-y-6">
      <Seitenkopf titel={t.navigation.serienbriefe} beschreibung={t.seiten.serienbriefe} />
      {neu && (
        <Karte titel={fuelle(ts.serieErstellt, { anzahl: neu.dokumente.length })}>
          <ul className="space-y-1 text-sm" data-serie-neu>
            {neu.dokumente.map((d) => (
              <li key={d.id}>
                <Link href={`/import/dokumente/${d.id}`} className="text-sky-700 hover:underline">
                  {d.titel}
                </Link>
              </li>
            ))}
          </ul>
        </Karte>
      )}

      <Karte titel={ts.erstellen}>
        {vorlagen.length === 0 ? (
          <Leer>{ts.keineVorlagen}</Leer>
        ) : (
          <form method="get" action="/serienbriefe/vorschau" className="space-y-3">
            <p className="text-sm text-slate-600">{ts.erstellenHinweis}</p>
            <Felder>
              <Auswahl name="vorlage" label={ts.vorlage} optionen={vorlagen.map((v) => ({ wert: v.id, text: `${v.name} (${ts.arten[v.art]})` }))} pflicht />
              <Feld name="datum" label={ts.datum} typ="date" wert={heute()} pflicht />
              <Auswahl name="gesellschaft" label={ts.gesellschaft} optionen={gesellschaften.map(([id, name]) => ({ wert: id, text: name }))} leerText={ts.alleGesellschaften} />
              <Auswahl name="haus" label={ts.haus} optionen={haeuser.map((h) => ({ wert: h.id, text: `${h.bezeichnung} (${h.gesellschaft.name})` }))} leerText={ts.alleHaeuser} />
              <Feld name="prozent" label={ts.prozent} inputMode="decimal" hinweis={ts.prozentHinweis} />
              <Feld name="betrag" label={ts.betrag} inputMode="decimal" />
            </Felder>
            <button type="submit" className={knopfKlasse("primaer")}>
              {ts.zurVorschau}
            </button>
          </form>
        )}
      </Karte>

      <Karte titel={ts.vorlagen}>
        {vorlagen.length === 0 ? (
          <Leer>{ts.keineVorlagen}</Leer>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{ts.name}</th>
                <th>{ts.art}</th>
                <th>{ts.betreff}</th>
                {schreiben && <th />}
              </tr>
            </thead>
            <tbody>
              {vorlagen.map((v) => (
                <Fragment key={v.id}>
                  <tr data-vorlage={v.name}>
                    <td className="font-medium">{v.name}</td>
                    <td>
                      <Marke ton={v.art === "MIETERHOEHUNG" ? "warnung" : "neutral"}>{ts.arten[v.art]}</Marke>
                    </td>
                    <td className="text-sm">{v.betreff}</td>
                    {schreiben && (
                      <td className="text-right">
                        <Formular aktion={vorlageLoeschen.bind(null, v.id)} absenden={t.allgemein.loeschen} art="gefahr" bestaetigen={t.allgemein.loeschenBestaetigen} inline />
                      </td>
                    )}
                  </tr>
                  <tr>
                    <td colSpan={4} className="pt-0">
                      <details>
                        <summary className="cursor-pointer text-xs text-sky-700">{schreiben ? ts.bearbeiten : ts.text}</summary>
                        {schreiben ? (
                          <Formular aktion={vorlageSpeichern} absenden={t.allgemein.speichern} className="mt-2 space-y-3">
                            {vorlageFelder(v)}
                          </Formular>
                        ) : (
                          <p className="mt-2 whitespace-pre-wrap text-sm">{v.text}</p>
                        )}
                      </details>
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </Tabelle>
        )}
        {schreiben && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-sky-700">{ts.vorlageNeu}</summary>
            <Formular aktion={vorlageSpeichern} absenden={t.allgemein.speichern} className="mt-3 space-y-3" zuruecksetzen>
              {vorlageFelder()}
            </Formular>
          </details>
        )}
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-sky-700">{ts.platzhalterTitel}</summary>
          <p className="mt-2 text-xs text-slate-500">{ts.platzhalterHinweis}</p>
          <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {PLATZHALTER.map((p) => (
              <div key={p} className="flex gap-2">
                <dt className="font-mono text-xs text-slate-700">{`{{${p}}}`}</dt>
                <dd className="text-slate-600">{ts.platzhalter[p]}</dd>
              </div>
            ))}
          </dl>
        </details>
      </Karte>

      <Karte titel={ts.serien}>
        {serien.length === 0 ? (
          <Leer>{ts.keineSerien}</Leer>
        ) : (
          <Tabelle>
            <tbody>
              {serien.map((s) => (
                <tr key={s.id} data-serie={s.id}>
                  <td>
                    <span className="font-medium">{s.titel}</span>
                    <div className="text-xs text-slate-500">
                      {ts.arten[s.art]}
                      {s.prozent && ` · ${f.prozent(s.prozent, 2)}`}
                      {s.betrag && ` · +${f.betrag(s.betrag)}`} · {f.datum(isoDatum(s.datum))} · {s.erstelltVon ?? "–"}
                    </div>
                  </td>
                  <td>
                    <details>
                      <summary className="cursor-pointer text-sm text-sky-700">{fuelle(ts.briefe, { anzahl: s.dokumente.length })}</summary>
                      <ul className="mt-1 space-y-0.5 text-sm">
                        {s.dokumente.map((d) => (
                          <li key={d.id}>
                            <Link href={`/import/dokumente/${d.id}`} className="hover:underline">
                              {d.titel}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabelle>
        )}
      </Karte>
    </div>
  );
}
