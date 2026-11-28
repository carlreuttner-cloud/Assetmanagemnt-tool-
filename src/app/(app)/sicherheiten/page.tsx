import Link from "next/link";
import { Begriff, Glossar, Hinweismarke, MitHerleitung, RestschuldWert, Unbekannt } from "@/components/herleitung";
import { Kachel, Kacheln, Karte, KnopfLink, Leer, Seitenkopf, Tabelle, rechts } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { heute } from "@/lib/datum";
import { ladeRechengrundlage } from "@/lib/daten/portfolio";
import { ladeSicherheiten } from "@/lib/daten/sicherheiten";
import { formatierer } from "@/lib/format";
import { dezimal, type Decimal } from "@/lib/geld";
import { restschuldNachweis } from "@/lib/kredit";
import { belastungHaus, istAktiv, istGrundpfandrecht, sicherungsverbuende } from "@/lib/sicherheit";

export default async function SicherheitenSeite() {
  const kontext = await pruefeZugriff("gesellschaften");
  const t = texte(kontext.mandant.sprache);
  const ts = t.sicherheiten;
  const f = formatierer(kontext.mandant);
  const stichtag = heute();
  const grundlage = await ladeRechengrundlage(kontext);
  const { zeilen, daten } = await ladeSicherheiten(kontext, grundlage.sicht);
  const schreiben = darf(kontext.rolle, "gesellschaften", "schreiben");
  const [haeuser, kreditNamen] = await Promise.all([
    kontext.db.haus.findMany({ where: { id: { in: grundlage.haeuser.map((h) => h.id) } }, orderBy: { bezeichnung: "asc" }, select: { id: true, bezeichnung: true } }),
    kontext.db.kredit.findMany({ where: { id: { in: grundlage.kredite.map((k) => k.id) } }, select: { id: true, bezeichnung: true, bank: true } }),
  ]);
  const kreditName = new Map(kreditNamen.map((k) => [k.id, k.bezeichnung]));
  const nachweise = new Map(grundlage.kredite.map((k) => [k.id, restschuldNachweis(k, stichtag)]));
  const verbuende = sicherungsverbuende(daten, grundlage.kredite.map((k) => ({ id: k.id, restschuld: nachweise.get(k.id) ?? null })), stichtag).filter((v) => v.sicherheitIds.length > 0);
  const aktiv = zeilen.filter((_, i) => istAktiv(daten[i], stichtag));
  const geloescht = zeilen.filter((_, i) => !istAktiv(daten[i], stichtag));
  const grundpfand = aktiv.filter((s) => istGrundpfandrecht(s.art));
  const weitere = aktiv.filter((s) => !istGrundpfandrecht(s.art));

  let gesamt: Decimal | null = dezimal(0);
  for (const s of grundpfand) gesamt = s.betrag === null || gesamt === null ? null : gesamt.plus(dezimal(s.betrag));
  const freiBekannt = verbuende.filter((v) => v.kreditIds.length > 0);
  let frei: Decimal | null = dezimal(0);
  for (const v of freiBekannt) frei = v.freieGrundschuld === null || frei === null ? null : frei.plus(v.freieGrundschuld);

  const verkehrswert = (hausId: string) => {
    const h = grundlage.haeuser.find((x) => x.id === hausId);
    return (h?.verkehrswerte ?? []).filter((v) => v.stichtag <= stichtag).sort((a, b) => (a.stichtag < b.stichtag ? 1 : -1))[0] ?? null;
  };
  const quelle = (s: (typeof zeilen)[number]) => (
    <span className="text-xs">
      {ts.quellen[s.quelle]}
      {s.stand && ` · ${f.datum(s.stand)}`}
      {s.dokument && (
        <>
          {" · "}
          <Link href={`/import/dokumente/${s.dokument.id}`} className="text-sky-700 hover:underline">
            {s.dokument.titel}
          </Link>
        </>
      )}
    </span>
  );
  const name = (s: (typeof zeilen)[number]) =>
    schreiben ? (
      <Link href={`/sicherheiten/${s.id}`} className="font-medium hover:underline">
        {ts.arten[s.art]}
      </Link>
    ) : (
      ts.arten[s.art]
    );
  const kreditListe = (s: (typeof zeilen)[number]) =>
    s.kredite.length === 0 ? (
      "–"
    ) : (
      <span className="text-xs">
        {s.kredite.map((k, i) => (
          <span key={k.kreditId}>
            {i > 0 && ", "}
            <Link href={`/gesellschaften/kredite/${k.kreditId}`} className="hover:underline">
              {k.kredit.bezeichnung}
            </Link>
          </span>
        ))}
      </span>
    );

  return (
    <div className="max-w-7xl space-y-6">
      <Seitenkopf
        titel={t.navigation.sicherheiten}
        beschreibung={t.seiten.sicherheiten}
        aktionen={
          schreiben && (
            <KnopfLink href="/sicherheiten/neu" art="primaer">
              {ts.neu}
            </KnopfLink>
          )
        }
      />
      {zeilen.length === 0 ? (
        <Leer>{ts.leer}</Leer>
      ) : (
        <>
          <Kacheln>
            <Kachel titel={ts.kacheln.aktiv} wert={aktiv.length} unter={fuelle(ts.kachelUnter, { datum: f.datum(stichtag) })} />
            <Kachel titel={<Begriff k="Grundschuld" t={t}>{ts.kacheln.grundpfandrechte}</Begriff>} wert={gesamt === null ? <Unbekannt t={t} grund={ts.luecken.betrag} /> : f.betragGanz(gesamt)} />
            <Kachel
              titel={<Begriff k="FreieGrundschuld" t={t}>{ts.kacheln.frei}</Begriff>}
              wert={frei === null ? <Unbekannt t={t} grund={ts.luecken.restschuld} /> : f.betragGanz(frei)}
              unter={frei === null && freiBekannt.some((v) => v.freieGrundschuld !== null) ? <Hinweismarke>{t.allgemein.unbekannt}</Hinweismarke> : undefined}
            />
          </Kacheln>

          <Karte titel={ts.jeHaus}>
            <p className="mb-3 text-sm text-slate-600">{ts.jeHausHinweis}</p>
            {haeuser.filter((h) => grundpfand.some((s) => s.haeuser.some((x) => x.hausId === h.id))).map((h) => {
              const liste = grundpfand.filter((s) => s.haeuser.some((x) => x.hausId === h.id));
              const b = belastungHaus(daten, h.id, stichtag);
              const vw = verkehrswert(h.id);
              return (
                <div key={h.id} className="mb-6" data-haus-sicherheiten={h.bezeichnung}>
                  <h3 className="mb-2 text-sm font-semibold text-slate-800">
                    <Link href={`/haeuser/${h.id}`} className="hover:underline">
                      {h.bezeichnung}
                    </Link>
                  </h3>
                  <Tabelle>
                    <thead>
                      <tr>
                        <th>
                          <Begriff k="Rang" t={t}>{ts.spalten.rang}</Begriff>
                        </th>
                        <th>{ts.spalten.art}</th>
                        <th>{ts.spalten.glaeubiger}</th>
                        <th className={rechts}>{ts.spalten.betrag}</th>
                        <th>{ts.spalten.kredite}</th>
                        <th>{ts.spalten.fundstelle}</th>
                        <th>{ts.spalten.quelle}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {liste.map((s) => (
                        <tr key={s.id}>
                          <td>{s.rang ?? "–"}</td>
                          <td>
                            {name(s)}
                            {s.haeuser.length > 1 && <Hinweismarke>{ts.gesamtrecht}</Hinweismarke>}
                          </td>
                          <td>{s.glaeubiger}</td>
                          <td className={rechts}>{s.betrag === null ? <Unbekannt t={t} /> : f.betragGanz(s.betrag)}</td>
                          <td>{kreditListe(s)}</td>
                          <td className="text-xs">{s.fundstelle ?? "–"}</td>
                          <td>{quelle(s)}</td>
                        </tr>
                      ))}
                      <tr className="font-medium">
                        <td colSpan={3}>{ts.summe}</td>
                        <td className={rechts}>{b.summe === null ? <Unbekannt t={t} /> : f.betragGanz(b.summe)}</td>
                        <td colSpan={3} className="text-xs font-normal text-slate-600">
                          {ts.spalten.belastung}:{" "}
                          {b.summe && vw && vw.wert.greaterThan(0) ? (
                            <MitHerleitung
                              wert={f.prozent(b.summe.dividedBy(vw.wert).times(100), 1)}
                              herleitung={{ berechnung: ts.belastungHerleitung, werte: [[ts.spalten.grundpfandrechte, f.betragGanz(b.summe)], [ts.spalten.verkehrswert, f.betragGanz(vw.wert)]], stichtag: f.datum(vw.stichtag) }}
                              t={t}
                            />
                          ) : (
                            <Unbekannt t={t} />
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </Tabelle>
                </div>
              );
            })}
          </Karte>

          <Karte titel={<Begriff k="Sicherungsverbund" t={t}>{ts.verbuende}</Begriff>}>
            <p className="mb-3 text-sm text-slate-600">{ts.verbuendeHinweis}</p>
            <Tabelle>
              <thead>
                <tr>
                  <th>{ts.spalten.kredite}</th>
                  <th className={rechts}>{ts.spalten.restschuld}</th>
                  <th className={rechts}>{ts.spalten.grundpfandrechte}</th>
                  <th className={rechts}>
                    <Begriff k="FreieGrundschuld" t={t}>{ts.spalten.frei}</Begriff>
                  </th>
                </tr>
              </thead>
              <tbody>
                {verbuende.map((v, i) => (
                  <tr key={i} data-verbund>
                    <td className="text-sm">
                      {v.kreditIds.length === 0 ? (
                        <span className="italic text-slate-500">{ts.ohneKredit}</span>
                      ) : (
                        v.kreditIds.map((id) => (
                          <div key={id}>
                            <Link href={`/gesellschaften/kredite/${id}`} className="hover:underline">
                              {kreditName.get(id)}
                            </Link>
                          </div>
                        ))
                      )}
                    </td>
                    <td className={rechts}>
                      {v.kreditIds.map((id) => (
                        <div key={id}>
                          <RestschuldWert nachweis={nachweise.get(id) ?? null} t={t} f={f} ganz />
                        </div>
                      ))}
                    </td>
                    <td className={rechts}>{v.grundpfandrechte === null ? <Unbekannt t={t} grund={ts.luecken.betrag} /> : f.betragGanz(v.grundpfandrechte)}</td>
                    <td className={rechts}>
                      {v.freieGrundschuld === null ? (
                        <Unbekannt t={t} grund={v.luecken.map((l) => ts.luecken[l]).join(" · ")} />
                      ) : (
                        <MitHerleitung
                          wert={
                            <span className={v.freieGrundschuld.isNegative() ? "text-red-700" : ""}>
                              {f.betragGanz(v.freieGrundschuld)}
                              {v.freieGrundschuld.isNegative() && <Hinweismarke>{ts.unterdeckung}</Hinweismarke>}
                            </span>
                          }
                          herleitung={{
                            berechnung: fuelle(ts.freiHerleitung, { gp: f.betragGanz(v.grundpfandrechte!), rs: f.betragGanz(v.restschuld!) }),
                            stichtag: v.stichtage.von === v.stichtage.bis ? f.datum(v.stichtage.von) : `${f.datum(v.stichtage.von)} – ${f.datum(v.stichtage.bis)}`,
                          }}
                          t={t}
                          ausrichtung="rechts"
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabelle>
          </Karte>

          {weitere.length > 0 && (
            <Karte titel={ts.weitere}>
              <Tabelle>
                <thead>
                  <tr>
                    <th>{ts.spalten.art}</th>
                    <th>{ts.spalten.glaeubiger}</th>
                    <th>{ts.spalten.sicherungsgeber}</th>
                    <th className={rechts}>{ts.spalten.betrag}</th>
                    <th>{ts.spalten.kredite}</th>
                    <th>{ts.spalten.quelle}</th>
                  </tr>
                </thead>
                <tbody>
                  {weitere.map((s) => (
                    <tr key={s.id}>
                      <td>{name(s)}</td>
                      <td>{s.glaeubiger}</td>
                      <td>{s.sicherungsgeber ?? s.gesellschaft?.name ?? "–"}</td>
                      <td className={rechts}>{s.betrag === null ? "–" : f.betragGanz(s.betrag)}</td>
                      <td>{kreditListe(s)}</td>
                      <td>{quelle(s)}</td>
                    </tr>
                  ))}
                </tbody>
              </Tabelle>
            </Karte>
          )}

          {geloescht.length > 0 && (
            <details className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
              <summary className="cursor-pointer font-medium text-slate-700">
                {ts.geloescht} ({geloescht.length})
              </summary>
              <ul className="mt-3 space-y-1">
                {geloescht.map((s) => (
                  <li key={s.id}>
                    {name(s)} · {s.glaeubiger} · {s.betrag === null ? "–" : f.betragGanz(s.betrag)} · {s.geloeschtAm ? f.datum(s.geloeschtAm) : s.gueltigBis ? f.datum(s.gueltigBis) : "–"}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      <Glossar begriffe={["Grundschuld", "Rang", "Sicherungsverbund", "FreieGrundschuld", "Restschuld"]} t={t} />
    </div>
  );
}
