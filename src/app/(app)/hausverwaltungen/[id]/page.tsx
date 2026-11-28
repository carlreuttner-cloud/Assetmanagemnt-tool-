import Link from "next/link";
import { notFound } from "next/navigation";
import { Liniendiagramm, type Reihe } from "@/components/diagramme";
import { Formular } from "@/components/formular";
import { MitHerleitung } from "@/components/herleitung";
import { NutzungsartMarke } from "@/components/nutzungsart";
import { Auswahl, Feld, Felder, Kachel, Kacheln, Karte, Leer, Marke, MieteZelle, Seitenkopf, Tabelle, Textfeld, rechts } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { bereichsSicht } from "@/lib/auth/auswahl";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { idFilter } from "@/lib/auth/sichtbarkeit";
import { heute } from "@/lib/datum";
import { ladeHausBestand, ladeZuordnungen } from "@/lib/daten/hausverwaltung";
import { ladeStaende } from "@/lib/daten/mieterstand";
import { DIAGRAMM_FARBEN } from "@/lib/farben";
import { formatierer } from "@/lib/format";
import { dezimal, type Decimal } from "@/lib/geld";
import { entwicklung, haeuserAm, type EntwicklungsPunkt } from "@/lib/hausverwaltung";
import { inFlaeche } from "@/lib/nutzungsart";
import { hausverwaltungLoeschen, hausverwaltungSpeichern, zuordnungLoeschen, zuordnungSpeichern } from "../aktionen";

export default async function HausverwaltungSeite({ params }: PageProps<"/hausverwaltungen/[id]">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("haeuser");
  const t = texte(kontext.mandant.sprache);
  const th = t.hausverwaltungen;
  const tm = t.mieterstand;
  const f = formatierer(kontext.mandant);
  const stichtag = heute();
  const schreiben = darf(kontext.rolle, "haeuser", "schreiben");
  const sicht = await bereichsSicht(kontext);
  const hv = await kontext.db.hausverwaltung.findFirst({ where: { id } });
  if (!hv) notFound();
  const [alleZuordnungen, haeuser] = await Promise.all([
    ladeZuordnungen(kontext),
    kontext.db.haus.findMany({ where: { id: idFilter(sicht.hausIds) }, orderBy: { bezeichnung: "asc" }, select: { id: true, bezeichnung: true } }),
  ]);
  const eigene = alleZuordnungen.filter((z) => z.hausverwaltungId === id);
  // Bei eingeschränkter Sicht nur Hausverwaltungen mit sichtbaren Häusern
  if (sicht.hausIds !== "alle" && eigene.length === 0) notFound();
  const hausName = new Map(haeuser.map((h) => [h.id, h.bezeichnung]));
  const aktuelleIds = haeuserAm(alleZuordnungen, id, stichtag);
  const jemals = [...new Set(eigene.map((z) => z.hausId))];
  const [bestand, staende] = await Promise.all([ladeHausBestand(kontext, aktuelleIds, stichtag), ladeStaende(kontext, { in: jemals })]);
  const leere = bestand.flatMap((h) => h.leere).sort((a, b) => a.haus.localeCompare(b.haus, "de") || a.einheit.localeCompare(b.einheit, "de", { numeric: true }));
  const flaeche = bestand.reduce((s, h) => s.plus(h.flaeche), dezimal(0));
  const leerFlaeche = bestand.reduce((s, h) => s.plus(h.leerFlaeche), dezimal(0));
  const quote = flaeche.isZero() ? null : leerFlaeche.dividedBy(flaeche).times(100);
  const entgangen = leere.reduce((s, l) => s.plus(l.erwarteteMiete ?? 0), dezimal(0));
  const ohneErwartet = leere.filter((l) => !l.erwarteteMiete).length;
  const stellplaetze = leere.filter((l) => !inFlaeche(l.art)).length;

  // Entwicklung: gesamt und je Haus (nur in den Zeiträumen dieser Hausverwaltung)
  const gesamt = entwicklung(staende, { zuordnungen: alleZuordnungen, hausverwaltungId: id });
  const jeHaus = jemals.map((hausId) => ({ hausId, punkte: entwicklung(staende, { zuordnungen: alleZuordnungen, hausverwaltungId: id, hausId }) }));
  const reihen = (wert: (p: EntwicklungsPunkt) => Decimal | null): Reihe[] => [
    { name: th.gesamt, farbe: "#334155", punkte: gesamt.map((p) => ({ x: p.stichtag, y: wert(p) })) },
    ...jeHaus.map((h, i) => ({ name: hausName.get(h.hausId) ?? h.hausId, farbe: DIAGRAMM_FARBEN[i % DIAGRAMM_FARBEN.length], gestrichelt: true, punkte: h.punkte.map((p) => ({ x: p.stichtag, y: wert(p) })) })),
  ];
  const monat = (d: string) => f.datum(d).slice(3);

  const statusVon = (z: (typeof eigene)[number]) => (z.von > stichtag ? "kuenftig" : z.bis && z.bis < stichtag ? "frueher" : "aktuell");

  return (
    <div className="max-w-6xl space-y-6">
      <Seitenkopf
        titel={hv.name}
        beschreibung={[hv.ansprechpartner, hv.email, hv.telefon].filter(Boolean).join(" · ") || undefined}
        zurueck={{ href: "/hausverwaltungen", text: th.zurUebersicht }}
      />

      <Kacheln>
        <Kachel titel={th.haeuserAktuell} wert={aktuelleIds.length} unter={`${bestand.reduce((s, h) => s + h.einheiten, 0)} ${th.einheiten}`} />
        <Kachel
          titel={tm.summen.leerQuote}
          wert={
            <MitHerleitung
              t={t}
              wert={f.prozent(quote, 1)}
              herleitung={{ berechnung: tm.herleitung.leerQuote, werte: [[tm.summen.leerFlaeche, f.flaeche(leerFlaeche)], [tm.summen.flaeche, f.flaeche(flaeche)]], stichtag: f.datum(stichtag), hinweis: stellplaetze ? `${stellplaetze} ${t.nutzungsarten.STELLPLATZ}` : undefined }}
            />
          }
          unter={`${leere.length} ${th.leerstand}`}
          ton={leere.length > 0 ? "warnung" : undefined}
        />
        <Kachel
          titel={tm.summen.entgangenMonat}
          wert={f.betrag(entgangen)}
          unter={`${f.jahresmiete(entgangen)} / ${t.allgemein.jahr}${ohneErwartet ? ` · ${ohneErwartet} × ${th.keineErwartete}` : ""}`}
          ton={ohneErwartet ? "warnung" : undefined}
        />
      </Kacheln>

      <Karte titel={th.leerTitel}>
        <p className="mb-3 text-xs text-slate-500">{th.leerBeschreibung}</p>
        {leere.length === 0 ? (
          <Leer>{th.keineLeerstaende}</Leer>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{th.spalten.haus}</th>
                <th>{th.spalten.einheit}</th>
                <th className={rechts}>{th.spalten.flaeche}</th>
                <th>{th.spalten.leerSeit}</th>
                <th className={rechts}>{th.spalten.dauer}</th>
                <th className={rechts}>{th.spalten.entgangenMonat}</th>
                <th className={rechts}>{th.spalten.entgangenSeit}</th>
              </tr>
            </thead>
            <tbody>
              {leere.map((l) => (
                <tr key={l.einheitId} data-leer={`${l.haus} ${l.einheit}`}>
                  <td>
                    <Link href={`/haeuser/${l.hausId}#einheiten`} className="hover:underline">
                      {l.haus}
                    </Link>
                  </td>
                  <td>
                    {l.einheit} {l.lage && <span className="text-xs text-slate-500">{l.lage}</span>}
                    <div className="mt-0.5">
                      <NutzungsartMarke art={l.art} t={t} />
                    </div>
                  </td>
                  <td className={rechts}>{inFlaeche(l.art) ? f.flaeche(l.flaeche) : `1 ${t.nutzung.stueck}`}</td>
                  <td>
                    {l.seit ? (
                      <MitHerleitung
                        t={t}
                        wert={`${l.seit.art === "spaetestens" ? `${th.spaetestens} ` : ""}${f.datum(l.seit.datum)}`}
                        herleitung={{ berechnung: l.seit.art === "vertragsende" ? fuelle(th.seitVertragsende, { datum: f.datum(l.letztesEnde) }) : th.spaetestensHinweis }}
                      />
                    ) : (
                      <span className="text-xs text-slate-500">{th.dauerUnbekannt}</span>
                    )}
                  </td>
                  <td className={`${rechts} whitespace-nowrap`}>{l.seit ? `${l.seit.art === "spaetestens" ? "≥ " : ""}${fuelle(th.monate, { anzahl: l.seit.monate })}` : t.allgemein.unbekannt}</td>
                  <td className={rechts}>{l.erwarteteMiete ? <MieteZelle monat={f.betrag(l.erwarteteMiete)} jahr={f.jahresmiete(l.erwarteteMiete)} /> : <span className="text-xs text-amber-700">{th.keineErwartete}</span>}</td>
                  <td className={rechts}>
                    {l.entgangenSeit ? (
                      <MitHerleitung
                        ausrichtung="rechts"
                        t={t}
                        wert={`${l.seit?.art === "spaetestens" ? "≥ " : ""}${f.betrag(l.entgangenSeit)}`}
                        herleitung={{ berechnung: th.entgangenHerleitung, werte: [[th.spalten.entgangenMonat, f.betrag(l.erwarteteMiete)], [th.spalten.dauer, fuelle(th.monate, { anzahl: l.seit!.monate })]], stichtag: f.datum(stichtag), hinweis: l.seit?.art === "spaetestens" ? th.spaetestensHinweis : undefined }}
                      />
                    ) : (
                      t.allgemein.unbekannt
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2}>{t.allgemein.summe}</td>
                <td className={rechts}>{f.flaeche(leerFlaeche)}</td>
                <td colSpan={2} />
                <td className={rechts}>
                  <MieteZelle monat={f.betrag(entgangen)} jahr={f.jahresmiete(entgangen)} />
                  {ohneErwartet > 0 && <div className="text-xs font-normal text-amber-700">{t.allgemein.unvollstaendig}</div>}
                </td>
                <td />
              </tr>
            </tfoot>
          </Tabelle>
        )}
      </Karte>

      <Karte titel={th.entwicklung}>
        <p className="mb-3 text-xs text-slate-500">{th.entwicklungBeschreibung}</p>
        {gesamt.length === 0 ? (
          <Leer>{th.keineStaende}</Leer>
        ) : (
          <div className="space-y-6" data-entwicklung>
            {(
              [
                [th.diagrammFlaeche, (p: EntwicklungsPunkt) => p.summen.leerFlaeche.wert, (w: Decimal) => f.zahl(w, 0)],
                [th.diagrammQuote, (p: EntwicklungsPunkt) => p.summen.leerQuote.wert, (w: Decimal) => f.prozent(w, 1)],
                [th.diagrammEntgangen, (p: EntwicklungsPunkt) => p.summen.entgangenMonat.wert, (w: Decimal) => f.betragKurz(w)],
              ] as const
            ).map(([titel, wert, format]) => (
              <div key={titel}>
                <h3 className="mb-1 text-sm font-medium text-slate-700">{titel}</h3>
                <Liniendiagramm reihen={reihen(wert)} formatY={format} formatX={monat} ab0 />
              </div>
            ))}
            <p className="text-xs text-slate-500">{th.lueckeHinweis}</p>
            <details>
              <summary className="cursor-pointer text-sm text-sky-700">{th.tabelle}</summary>
              <Tabelle>
                <thead>
                  <tr>
                    <th>{th.stichtag}</th>
                    <th className={rechts}>{th.haeuserMitStand}</th>
                    <th className={rechts}>{tm.summen.leerFlaeche}</th>
                    <th className={rechts}>{tm.summen.leerQuote}</th>
                    <th className={rechts}>{tm.summen.entgangenMonat}</th>
                  </tr>
                </thead>
                <tbody>
                  {gesamt.map((p) => (
                    <tr key={p.stichtag}>
                      <td>
                        {f.datum(p.stichtag)}
                        {p.nurLeerstand && <span className="ml-2"><Marke ton="warnung">{tm.arten.NUR_LEERSTAND}</Marke></span>}
                      </td>
                      <td className={rechts}>
                        {p.haeuser}
                        {p.genau < p.haeuser && <span className="text-xs text-slate-500"> ({p.genau} {th.stichtag})</span>}
                      </td>
                      <td className={rechts}>{p.summen.leerFlaeche.wert ? f.flaeche(p.summen.leerFlaeche.wert) : t.allgemein.unbekannt}</td>
                      <td className={rechts}>{p.summen.leerQuote.wert ? f.prozent(p.summen.leerQuote.wert, 1) : t.allgemein.unbekannt}</td>
                      <td className={rechts}>
                        {p.summen.entgangenMonat.wert ? <MieteZelle monat={f.betrag(p.summen.entgangenMonat.wert)} jahr={f.jahresmiete(p.summen.entgangenMonat.wert)} /> : t.allgemein.unbekannt}
                        {p.summen.entgangenMonat.unvollstaendig && <div className="text-xs text-amber-700">{t.allgemein.unvollstaendig}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Tabelle>
            </details>
          </div>
        )}
      </Karte>

      <Karte titel={th.zuordnungen}>
        {eigene.length === 0 ? (
          <Leer>{th.keineZuordnungen}</Leer>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{th.haus}</th>
                <th>{th.von}</th>
                <th>{th.bis}</th>
                <th />
                <th>{th.notiz}</th>
                {schreiben && <th />}
              </tr>
            </thead>
            <tbody>
              {eigene.map((z) => {
                const s = statusVon(z);
                return (
                  <tr key={z.id} data-zuordnung={hausName.get(z.hausId)}>
                    <td>
                      <Link href={`/haeuser/${z.hausId}`} className="hover:underline">
                        {hausName.get(z.hausId) ?? "–"}
                      </Link>
                    </td>
                    <td>{f.datum(z.von)}</td>
                    <td>{z.bis ? f.datum(z.bis) : th.laeuft}</td>
                    <td>
                      <Marke ton={s === "aktuell" ? "gut" : "neutral"}>{th[s]}</Marke>
                    </td>
                    <td className="text-sm text-slate-500">{z.notiz}</td>
                    {schreiben && (
                      <td className="text-right">
                        <Formular aktion={zuordnungLoeschen.bind(null, z.id)} absenden={t.allgemein.loeschen} art="gefahr" bestaetigen={t.allgemein.loeschenBestaetigen} inline />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Tabelle>
        )}
        {schreiben && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm text-sky-700">{th.zuordnen}</summary>
            <Formular aktion={zuordnungSpeichern.bind(null, id)} absenden={t.allgemein.speichern} className="mt-3 space-y-3" zuruecksetzen>
              <p className="text-xs text-slate-500">{th.zuordnenHinweis}</p>
              <Felder>
                <Auswahl name="hausId" label={th.haus} optionen={haeuser.map((h) => ({ wert: h.id, text: h.bezeichnung }))} pflicht />
                <Feld name="von" label={th.von} typ="date" wert={stichtag} pflicht />
                <Feld name="bis" label={th.bis} typ="date" />
                <Feld name="notiz" label={th.notiz} />
              </Felder>
            </Formular>
          </details>
        )}
      </Karte>

      {schreiben && (
        <Karte titel={th.bearbeiten}>
          <Formular aktion={hausverwaltungSpeichern} absenden={t.allgemein.speichern} className="space-y-3">
            <input type="hidden" name="id" value={hv.id} />
            <Felder>
              <Feld name="name" label={th.name} wert={hv.name} pflicht />
              <Feld name="ansprechpartner" label={th.ansprechpartner} wert={hv.ansprechpartner} />
              <Feld name="email" label={th.email} typ="email" wert={hv.email} />
              <Feld name="telefon" label={th.telefon} wert={hv.telefon} />
              <Textfeld name="notiz" label={th.notiz} wert={hv.notiz} />
            </Felder>
          </Formular>
          {eigene.length === 0 && (
            <div className="mt-4">
              <Formular aktion={hausverwaltungLoeschen.bind(null, hv.id)} absenden={t.allgemein.loeschen} art="gefahr" bestaetigen={t.allgemein.loeschenBestaetigen} inline />
            </div>
          )}
        </Karte>
      )}
    </div>
  );
}
