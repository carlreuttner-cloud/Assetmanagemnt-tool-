import type { ReactNode } from "react";
import Link from "next/link";
import { Wasserfall } from "@/components/diagramme";
import { Formular } from "@/components/formular";
import { Begriff, Glossar, MitHerleitung, Unbekannt } from "@/components/herleitung";
import { Feld, Kachel, Kacheln, Karte, KnopfLink, Leer, Marke, Seitenkopf, Tabelle, knopfKlasse, rechts } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { bewerteHaus } from "@/lib/bewertung";
import { heute, isoDatum, istIsoDatum } from "@/lib/datum";
import { ladeRechengrundlage } from "@/lib/daten/portfolio";
import { gewaehlterPreis, PREIS_BASEN, preisvorschlaege, rechneExit, type ExitParameter, type PreisBasis } from "@/lib/exit";
import { formatierer } from "@/lib/format";
import { dezimal, parseBetrag, type Decimal } from "@/lib/geld";
import { exitLoeschen, exitSpeichern } from "./aktionen";

const EINGABE = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm shadow-sm";

export default async function ExitSeite({ searchParams }: PageProps<"/exit">) {
  const kontext = await pruefeZugriff("szenarien");
  const t = texte(kontext.mandant.sprache);
  const te = t.exit;
  const f = formatierer(kontext.mandant);
  const stichtag = heute();
  const sp = await searchParams;
  const wert = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");

  const { haeuser, kredite, referenzwerte } = await ladeRechengrundlage(kontext, { bereich: true });
  const liste = await kontext.db.haus.findMany({
    where: { id: { in: haeuser.map((h) => h.id) } },
    orderBy: [{ gesellschaft: { name: "asc" } }, { bezeichnung: "asc" }],
    select: { id: true, bezeichnung: true, gesellschaft: { select: { name: true } } },
  });
  if (liste.length === 0) {
    return (
      <div>
        <Seitenkopf titel={te.titel} beschreibung={te.beschreibung} />
        <Leer>{te.keine}</Leer>
      </div>
    );
  }
  const hausId = liste.find((h) => h.id === wert("h"))?.id ?? liste[0].id;
  const daten = haeuser.find((h) => h.id === hausId)!;
  const [haus, gespeicherte] = await Promise.all([
    kontext.db.haus.findFirst({
      where: { id: hausId },
      select: {
        id: true,
        bezeichnung: true,
        kaufpreis: true,
        gesellschaftId: true,
        gutachten: { select: { id: true, stichtag: true, verkehrswert: true, bodenwert: true, gebaeudewert: true, gutachter: true, rohertragJahr: true } },
        verkehrswerte: { where: { gutachten: null }, select: { id: true, stichtag: true, wert: true, quelle: true } },
        investitionen: { select: { betrag: true } },
      },
    }),
    kontext.db.exitrechnung.findMany({ where: { hausId }, orderBy: { geaendertAm: "desc" } }),
  ]);
  if (!haus) return null;

  const bewertung = bewerteHaus(
    haus.gutachten.map((g) => ({
      id: g.id,
      hausId,
      stichtag: isoDatum(g.stichtag),
      verkehrswert: dezimal(g.verkehrswert),
      bodenwert: g.bodenwert ? dezimal(g.bodenwert) : null,
      gebaeudewert: g.gebaeudewert ? dezimal(g.gebaeudewert) : null,
      gutachter: g.gutachter,
    })),
    haus.verkehrswerte.map((v) => ({ id: v.id, hausId, stichtag: isoDatum(v.stichtag), wert: dezimal(v.wert), quelle: v.quelle })),
    stichtag,
  );
  const letztesGutachten = [...haus.gutachten].sort((a, b) => (a.stichtag < b.stichtag ? 1 : -1))[0];
  const faktorGutachten =
    letztesGutachten?.rohertragJahr && !dezimal(letztesGutachten.rohertragJahr).isZero()
      ? { wert: dezimal(letztesGutachten.verkehrswert).dividedBy(dezimal(letztesGutachten.rohertragJahr)), stichtag: isoDatum(letztesGutachten.stichtag) }
      : null;

  // Parameter: gespeicherte Rechnung als Vorgabe, Eingaben in der Adresse gehen vor
  const geladen = gespeicherte.find((r) => r.id === wert("r")) ?? null;
  const fehler: string[] = [];
  const zahl = (k: string, feld: string, vorgabe: Decimal | null): Decimal | null => {
    const roh = wert(k);
    if (!sp.d) return vorgabe;
    if (!roh) return null;
    try {
      return parseBetrag(roh.replace("%", ""), kontext.mandant.sprache);
    } catch {
      fehler.push(fuelle(te.ungueltig, { feld }));
      return vorgabe;
    }
  };
  const d = (w: { toFixed(): string } | null | undefined) => (w === null || w === undefined ? null : dezimal(w));
  const standardDatum = `${Number(stichtag.slice(0, 4)) + 1}-12-31`;
  const standardBasis: PreisBasis = bewertung.letztes ? "gutachten" : bewertung.marktwert ? "marktwert" : "miete";
  const datumRoh = wert("datum");
  const p: ExitParameter = {
    verkaufsdatum: sp.d && istIsoDatum(datumRoh) ? datumRoh : geladen ? isoDatum(geladen.verkaufsdatum) : standardDatum,
    basis: PREIS_BASEN.find((b) => b === wert("basis")) ?? (geladen?.preisBasis as PreisBasis | undefined) ?? standardBasis,
    preis: zahl("preis", te.preis, d(geladen?.preis)),
    faktor: zahl("faktor", te.faktor, d(geladen?.faktor)),
    maklerProzent: zahl("makler", te.makler, d(geladen?.maklerProzent)) ?? dezimal(0),
    sonstigeProzent: zahl("sonstige", te.sonstige, d(geladen?.sonstigeProzent)) ?? dezimal(0),
    vfeProzent: zahl("vfe", te.vfe, d(geladen?.vfeProzent)),
  };

  const vorschlag = preisvorschlaege(daten, bewertung, faktorGutachten, p.faktor, stichtag);
  const preis = gewaehlterPreis(vorschlag, p);
  const investitionen = haus.investitionen.reduce((s, i) => s.plus(i.betrag), dezimal(0));
  const e = rechneExit(hausId, preis, p, kredite, referenzwerte, stichtag, { kaufpreis: d(haus.kaufpreis), investitionen });
  const kreditName = new Map(kredite.map((k) => [k.id, k.bezeichnung]));
  const schreiben = darf(kontext.rolle, "szenarien", "schreiben");
  const zeige = (w: Decimal | null, grund?: string) => (w === null ? <Unbekannt t={t} grund={grund} /> : f.betragGanz(w));
  const eingabe = (w: Decimal | null, stellen = 2) => (w === null ? "" : f.eingabe(w, stellen));

  const link = (aenderung: Record<string, string>) => {
    const q = new URLSearchParams({
      h: hausId,
      d: "1",
      datum: p.verkaufsdatum,
      basis: p.basis,
      preis: eingabe(p.preis),
      faktor: eingabe(p.faktor, 4),
      makler: eingabe(p.maklerProzent),
      sonstige: eingabe(p.sonstigeProzent),
      vfe: eingabe(p.vfeProzent),
      ...aenderung,
    });
    return `/exit?${q.toString()}`;
  };

  const vorschlagKarte = (basis: PreisBasis, titel: string, wertNode: ReactNode, unter: ReactNode) => (
    <div className={`rounded-lg border p-4 ${p.basis === basis ? "border-teal-600 ring-1 ring-teal-600" : "border-slate-200"} bg-white`}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">{titel}</h3>
        {p.basis === basis ? (
          <Marke ton="gut">{te.gewaehlt}</Marke>
        ) : (
          <Link href={link({ basis })} className="text-xs font-medium text-teal-700 hover:underline">
            {te.uebernehmen}
          </Link>
        )}
      </div>
      <div className="mt-2 text-xl font-semibold tabular-nums">{wertNode}</div>
      <div className="mt-1 text-xs text-slate-500">{unter}</div>
    </div>
  );

  const vm = vorschlag.miete;
  const lueckenTexte = e.luecken.map((l) => te.lueckeTexte[l]);
  const vergangen = p.verkaufsdatum <= stichtag;

  return (
    <div className="max-w-6xl space-y-6">
      <Seitenkopf titel={te.titel} beschreibung={te.beschreibung} aktionen={<KnopfLink href={`/ki-vorschlag?h=${hausId}`}>{t.kiVorschlag.aufruf}</KnopfLink>} />

      <form method="get" action="/exit" className="flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">{te.haus}</span>
          <select name="h" defaultValue={hausId} className={EINGABE}>
            {liste.map((h) => (
              <option key={h.id} value={h.id}>
                {h.bezeichnung} · {h.gesellschaft.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={knopfKlasse("sekundaer")}>
          {te.hausWaehlen}
        </button>
        <Link href={`/haeuser/${hausId}`} className="pb-1.5 text-sm text-slate-600 hover:underline">
          {te.zurHaus} →
        </Link>
      </form>

      {fehler.length > 0 && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{fehler.join(" ")}</p>}

      <Karte titel={te.vorschlaege}>
        <p className="mb-3 text-xs text-slate-500">{te.vorschlaegeHinweis}</p>
        <div className="grid gap-4 md:grid-cols-3">
          {vorschlagKarte(
            "miete",
            te.vorschlagMiete,
            vm.preis ? (
              <MitHerleitung
                wert={f.betragGanz(vm.preis)}
                herleitung={{
                  berechnung: te.vorschlagMieteFormel,
                  werte: [
                    [<Begriff key="j" k="JNKM" t={t}>{te.jahresmiete}</Begriff>, `${f.betrag(vm.jahresmiete)} (${f.betrag(vm.sollMonat)} / ${t.allgemein.monat})`],
                    [<Begriff key="f" k="Rohertragsfaktor" t={t}>{te.faktorWert}</Begriff>, f.faktor(vm.faktor)],
                  ],
                  quelle: vm.faktorQuelle === "eingabe" ? te.faktorEingabe : fuelle(te.faktorAusGutachten, { datum: f.datum(vm.faktorStichtag!) }),
                  stichtag: f.datum(stichtag),
                }}
                t={t}
              />
            ) : (
              <Unbekannt t={t} grund={vm.jahresmiete.isZero() ? te.mieteFehlt : te.faktorFehlt} />
            ),
            <>
              {f.betragGanz(vm.jahresmiete)} × {vm.faktor ? f.faktor(vm.faktor) : "?"}
              {vm.faktorQuelle === "gutachten" && <> · {fuelle(te.faktorAusGutachten, { datum: f.datum(vm.faktorStichtag!) })}</>}
              {vm.faktorQuelle === "eingabe" && <> · {te.faktorEingabe}</>}
              {!vm.faktor && <span className="text-amber-700"> · {te.faktorFehlt}</span>}
            </>,
          )}
          {vorschlagKarte(
            "marktwert",
            te.vorschlagMarktwert,
            vorschlag.marktwert ? f.betragGanz(vorschlag.marktwert.wert) : <Unbekannt t={t} grund={te.marktwertFehlt} />,
            vorschlag.marktwert ? `${t.allgemein.stichtag} ${f.datum(vorschlag.marktwert.stichtag)}${vorschlag.marktwert.quelle ? ` · ${vorschlag.marktwert.quelle}` : ""}` : te.marktwertFehlt,
          )}
          {vorschlagKarte(
            "gutachten",
            te.vorschlagGutachten,
            vorschlag.gutachten ? f.betragGanz(vorschlag.gutachten.wert) : <Unbekannt t={t} grund={te.gutachtenFehlt} />,
            vorschlag.gutachten ? `${t.allgemein.stichtag} ${f.datum(vorschlag.gutachten.stichtag)}${vorschlag.gutachten.gutachter ? ` · ${vorschlag.gutachten.gutachter}` : ""}` : te.gutachtenFehlt,
          )}
        </div>
      </Karte>

      <Karte titel={te.annahmen}>
        <form method="get" action="/exit" className="space-y-4">
          <input type="hidden" name="h" value={hausId} />
          <input type="hidden" name="d" value="1" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Feld name="datum" label={te.verkaufsdatum} typ="date" wert={p.verkaufsdatum} hinweis={te.verkaufsdatumHinweis} pflicht />
            <label className="block text-sm">
              <span className="font-medium text-slate-700">{te.basis}</span>
              <select name="basis" defaultValue={p.basis} className={EINGABE}>
                {PREIS_BASEN.map((b) => (
                  <option key={b} value={b}>
                    {te.basen[b]}
                  </option>
                ))}
              </select>
            </label>
            <Feld name="preis" label={te.preis} wert={eingabe(p.preis)} inputMode="decimal" hinweis={te.preisHinweis} />
            <Feld name="faktor" label={te.faktor} wert={eingabe(p.faktor, 4)} inputMode="decimal" hinweis={te.faktorHinweis} />
            <Feld name="makler" label={te.makler} wert={eingabe(p.maklerProzent)} inputMode="decimal" hinweis={te.kostenLeer} />
            <Feld name="sonstige" label={te.sonstige} wert={eingabe(p.sonstigeProzent)} inputMode="decimal" hinweis={`${te.sonstigeHinweis}. ${te.kostenLeer}`} />
            <Feld name="vfe" label={<Begriff k="Vorfaelligkeit" t={t}>{te.vfe}</Begriff>} wert={eingabe(p.vfeProzent)} inputMode="decimal" hinweis={te.vfeHinweis} />
          </div>
          <button type="submit" className={knopfKlasse("primaer")}>
            {te.berechnen}
          </button>
        </form>
      </Karte>

      <div>
        <h2 className="mb-1 text-lg font-semibold">{fuelle(te.ergebnis, { datum: f.datum(p.verkaufsdatum) })}</h2>
        <p className="mb-3 text-xs text-slate-500">
          {haus.bezeichnung} · {vergangen ? te.ergebnisVergangen : te.steuernHinweis}
        </p>
        {lueckenTexte.length > 0 && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">{te.luecken}</p>
            <ul className="mt-1 list-disc pl-5">
              {lueckenTexte.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        )}
        <Kacheln>
          <Kachel titel={te.kachelPreis} wert={zeige(e.preis)} unter={te.basen[p.basis]} />
          <Kachel
            titel={te.kachelNetto}
            wert={
              e.nettoErloes ? (
                <MitHerleitung
                  wert={f.betragGanz(e.nettoErloes)}
                  herleitung={{
                    berechnung: te.nettoFormel,
                    werte: [
                      [te.stufen.makler, `${f.betrag(e.makler)} (${f.prozent(p.maklerProzent, 2)})`],
                      [te.stufen.sonstige, `${f.betrag(e.sonstige)} (${f.prozent(p.sonstigeProzent, 2)})`],
                    ],
                  }}
                  t={t}
                />
              ) : (
                <Unbekannt t={t} />
              )
            }
          />
          <Kachel titel={<Begriff k="Kreditabloese" t={t}>{te.kachelAbloese}</Begriff>} wert={zeige(e.abloese)} unter={e.vfe && !e.vfe.isZero() ? `+ VFE ${f.betragGanz(e.vfe)}` : undefined} />
          <Kachel
            titel={te.kachelErgebnis}
            ton={e.ergebnis?.isNegative() ? "schlecht" : e.ergebnis ? "gut" : undefined}
            wert={
              e.ergebnis ? (
                <MitHerleitung wert={f.betragGanz(e.ergebnis)} herleitung={{ berechnung: te.ergebnisFormel, stichtag: f.datum(p.verkaufsdatum), hinweis: te.steuernHinweis }} t={t} />
              ) : (
                <Unbekannt t={t} grund={lueckenTexte.join(" ")} />
              )
            }
          />
          <Kachel
            titel={<Begriff k="Einstand" t={t}>{te.kachelWertzuwachs}</Begriff>}
            wert={
              e.wertzuwachs ? (
                <MitHerleitung
                  wert={f.betragGanz(e.wertzuwachs)}
                  herleitung={{
                    berechnung: te.wertzuwachsFormel,
                    werte: [
                      [te.kaufpreis, f.betrag(d(haus.kaufpreis))],
                      [te.investitionen, f.betrag(investitionen)],
                    ],
                    hinweis: te.wertzuwachsHinweis,
                  }}
                  t={t}
                />
              ) : (
                <Unbekannt t={t} />
              )
            }
          />
        </Kacheln>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Karte titel={te.diagramm}>
          <Wasserfall
            schritte={[
              { name: te.stufenKurz.preis, titel: te.stufen.preis, wert: e.preis, art: "start" },
              { name: te.stufenKurz.makler, titel: te.stufen.makler, wert: e.makler, art: "abzug" },
              { name: te.stufenKurz.sonstige, titel: te.stufen.sonstige, wert: e.sonstige, art: "abzug" },
              { name: te.stufenKurz.abloese, titel: te.stufen.abloese, wert: e.abloese, art: "abzug" },
              { name: te.stufenKurz.vfe, titel: te.stufen.vfe, wert: e.vfe, art: "abzug" },
              { name: te.stufenKurz.ergebnis, titel: te.stufen.ergebnis, wert: e.ergebnis, art: "summe" },
            ]}
            format={(w) => f.betragGanz(w)}
            formatKurz={(w) => f.betragKurz(w)}
            unbekannt={t.allgemein.unbekannt}
          />
          {e.ergebnis?.isNegative() && <p className="mt-2 text-sm text-red-700">{te.negativ}</p>}
        </Karte>

        <Karte titel={te.kredite}>
          {e.kredite.length === 0 ? (
            <Leer>{te.keineKredite}</Leer>
          ) : (
            <Tabelle>
              <thead>
                <tr>
                  <th>{te.kredit}</th>
                  <th className={rechts}>{te.restschuld}</th>
                  <th className={rechts}>{te.anteil}</th>
                  <th className={rechts}>{te.abloese}</th>
                  <th className={rechts}>
                    <Begriff k="Vorfaelligkeit" t={t}>{te.vfeSpalte}</Begriff>
                  </th>
                </tr>
              </thead>
              <tbody>
                {e.kredite.map((k) => (
                  <tr key={k.kreditId}>
                    <td>
                      <Link href={`/gesellschaften/kredite/${k.kreditId}`} className="hover:underline">
                        {kreditName.get(k.kreditId)}
                      </Link>
                      {k.herkunft && <div className="text-xs text-slate-500">{te.herkunft[k.herkunft]}</div>}
                      {!k.anteilProzent.equals(100) && <div className="text-xs text-amber-700">{te.gesamtgrundschuld}</div>}
                    </td>
                    <td className={rechts}>
                      {k.restschuld === null ? (
                        <Unbekannt t={t} />
                      ) : (
                        <MitHerleitung
                          ausrichtung="rechts"
                          wert={f.betragGanz(k.restschuld)}
                          herleitung={{ berechnung: te.herkunftHinweis[k.herkunft!], stichtag: k.stichtag ? f.datum(k.stichtag) : undefined }}
                          t={t}
                        />
                      )}
                    </td>
                    <td className={rechts}>{f.prozent(k.anteilProzent, 1)}</td>
                    <td className={rechts}>{zeige(k.abloese)}</td>
                    <td className={rechts}>{!k.vfePflichtig ? <span className="text-xs text-slate-400" title={te.vfeNein}>–</span> : zeige(k.vfe, te.lueckeTexte.vfe)}</td>
                  </tr>
                ))}
              </tbody>
            </Tabelle>
          )}
        </Karte>
      </div>

      <Karte titel={te.gespeichert}>
        {gespeicherte.length === 0 ? (
          <Leer>{te.keineGespeichert}</Leer>
        ) : (
          <Tabelle>
            <tbody>
              {gespeicherte.map((r) => (
                <tr key={r.id} className={r.id === geladen?.id ? "bg-teal-50" : undefined}>
                  <td>
                    <Link href={`/exit?h=${hausId}&r=${r.id}`} className="font-medium hover:underline">
                      {r.name}
                    </Link>
                    {r.notiz && <div className="text-xs text-slate-500">{r.notiz}</div>}
                  </td>
                  <td className="whitespace-nowrap">{f.datum(r.verkaufsdatum)}</td>
                  <td>{te.basen[r.preisBasis as PreisBasis] ?? r.preisBasis}</td>
                  <td className="text-right">
                    {schreiben && <Formular aktion={exitLoeschen.bind(null, hausId, r.id)} absenden={t.allgemein.loeschen} bestaetigen={te.loeschenFrage} inline />}
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabelle>
        )}
        {schreiben && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <Formular aktion={exitSpeichern.bind(null, hausId)} absenden={te.speichern} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="datum" value={p.verkaufsdatum} />
              <input type="hidden" name="basis" value={p.basis} />
              <input type="hidden" name="preis" value={eingabe(p.preis)} />
              <input type="hidden" name="faktor" value={eingabe(p.faktor, 4)} />
              <input type="hidden" name="makler" value={eingabe(p.maklerProzent)} />
              <input type="hidden" name="sonstige" value={eingabe(p.sonstigeProzent)} />
              <input type="hidden" name="vfe" value={eingabe(p.vfeProzent)} />
              <div className="w-72">
                <Feld name="name" label={te.speichernName} pflicht wert={geladen?.name} />
              </div>
            </Formular>
          </div>
        )}
      </Karte>

      <Glossar begriffe={["JNKM", "Rohertragsfaktor", "Kreditabloese", "Vorfaelligkeit", "Einstand"]} t={t} />
    </div>
  );
}
