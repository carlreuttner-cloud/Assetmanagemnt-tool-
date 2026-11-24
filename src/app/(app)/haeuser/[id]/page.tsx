import Link from "next/link";
import { notFound } from "next/navigation";
import { Liniendiagramm } from "@/components/diagramme";
import { Formular } from "@/components/formular";
import { ZinsbindungMarke } from "@/components/kredit-marken";
import { Begriff, Glossar, Hinweismarke, Kennzahl, RestschuldWert, ZinssatzWert } from "@/components/herleitung";
import { Angaben, Auswahl, Feld, Felder, Kachel, Kacheln, Karte, KnopfLink, Leer, Marke, MieteZelle, Seitenkopf, Tabelle, rechts } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { MAX_BILD_MB } from "@/lib/dateispeicher";
import { formatMonat, heute, isoDatum } from "@/lib/datum";
import { erlaubt, ladeRechengrundlage } from "@/lib/daten/portfolio";
import { dezimal } from "@/lib/geld";
import { formatierer } from "@/lib/format";
import { hausKennzahlen, istAktiv } from "@/lib/kennzahlen";
import { restschuldNachweis, zinsbindung } from "@/lib/kredit";
import {
  fotoHochladen,
  fotoLoeschen,
  investitionHinzufuegen,
  investitionLoeschen,
  verkehrswertHinzufuegen,
  verkehrswertLoeschen,
} from "../aktionen";

export default async function HausSeite({ params }: PageProps<"/haeuser/[id]">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("haeuser");
  const t = texte(kontext.mandant.sprache);
  const f = formatierer(kontext.mandant);
  const stichtag = heute();
  const th = t.haeuser;
  const tk = t.kennzahlen;

  const grundlage = await ladeRechengrundlage(kontext);
  const haus = await kontext.db.haus.findFirst({
    where: { id: erlaubt(grundlage.sicht.hausIds, id) },
    include: {
      gesellschaft: { select: { id: true, name: true } },
      einheiten: {
        orderBy: [{ art: "desc" }, { bezeichnung: "asc" }],
        include: { mietverhaeltnisse: { include: { mieter: { select: { name: true } } }, orderBy: { beginn: "desc" } } },
      },
      verkehrswerte: { orderBy: { stichtag: "desc" } },
      investitionen: { orderBy: { datum: "desc" }, include: { einheit: { select: { bezeichnung: true } } } },
      fotos: { orderBy: { reihenfolge: "asc" } },
      kredite: { include: { kredit: { select: { id: true, bezeichnung: true, bank: true, kreditnummer: true, gesellschaftId: true } } } },
    },
  });
  if (!haus) notFound();
  const daten = grundlage.haeuser.find((h) => h.id === id)!;
  const { kredite, referenzwerte } = grundlage;
  const k = hausKennzahlen(daten, kredite, referenzwerte, stichtag);
  const p = { k, t, f, stichtag };
  const schreiben = darf(kontext.rolle, "haeuser", "schreiben");
  const darfGesellschaften = darf(kontext.rolle, "gesellschaften");
  const darfMieter = darf(kontext.rolle, "mieter");
  const summeInvestitionen = haus.investitionen.reduce((s, i) => s.plus(dezimal(i.betrag)), dezimal(0));
  const vollvermietung = k.sollMonat.plus(k.erwartetLeerMonat);
  // Wertentwicklung ab Kauf: Kaufpreis als Startpunkt, danach die Verkehrswerte
  const wertverlauf = [
    ...(haus.kaufpreis && haus.kaufdatum ? [{ x: isoDatum(haus.kaufdatum), y: dezimal(haus.kaufpreis) }] : []),
    ...haus.verkehrswerte.map((v) => ({ x: isoDatum(v.stichtag), y: dezimal(v.wert) })),
  ];

  return (
    <div className="space-y-6">
      <Seitenkopf
        titel={haus.bezeichnung}
        beschreibung={
          <>
            {[haus.strasse !== haus.bezeichnung ? haus.strasse : null, [haus.plz, haus.ort].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
            {" · "}
            {darfGesellschaften ? (
              <Link href={`/gesellschaften/${haus.gesellschaft.id}`} className="hover:underline">
                {haus.gesellschaft.name}
              </Link>
            ) : (
              haus.gesellschaft.name
            )}
          </>
        }
        zurueck={{ href: "/haeuser", text: th.titel }}
        aktionen={
          schreiben && (
            <>
              <KnopfLink href={`/haeuser/${id}/bearbeiten`}>{t.allgemein.bearbeiten}</KnopfLink>
              {darf(kontext.rolle, "import", "schreiben") && <KnopfLink href={`/import?haus=${id}`}>{t.importe.mieterlisteImportieren}</KnopfLink>}
              <KnopfLink href={`/haeuser/${id}/einheiten/neu`} art="primaer">
                {t.einheiten.neu}
              </KnopfLink>
            </>
          )
        }
      />

      <Kacheln>
        <Kachel
          titel={tk.verkehrswert}
          wert={<Kennzahl art="verkehrswert" {...p} ganz />}
          unter={`${tk.kaufpreis}: ${f.betragGanz(haus.kaufpreis)} (${f.datum(haus.kaufdatum)})`}
        />
        <Kachel
          titel={<Begriff k="Restschuld" t={t}>{tk.restschuld}</Begriff>}
          wert={<Kennzahl art="restschuld" {...p} ganz />}
          unter={
            <>
              <Begriff k="LTV" t={t} /> <Kennzahl art="ltv" {...p} /> · <Begriff k="DSCR" t={t} /> <Kennzahl art="dscr" {...p} />
            </>
          }
        />
        <Kachel
          titel={tk.sollMieteMonat}
          wert={<Kennzahl art="sollMonat" {...p} />}
          unter={
            <>
              {tk.sollMieteJahr} (<Begriff k="JNKM" t={t} />): <Kennzahl art="sollJahr" {...p} />
            </>
          }
        />
        <Kachel
          titel={tk.istMieteMonat}
          wert={<Kennzahl art="istMonat" {...p} />}
          unter={
            <>
              {tk.istMieteJahr}: <Kennzahl art="istJahr" {...p} />
            </>
          }
        />
        <Kachel
          titel={<Begriff k="Leerstand" t={t}>{tk.leerstandFlaeche}</Begriff>}
          wert={<Kennzahl art="leerstand" {...p} />}
          unter={
            <>
              {`${k.leereEinheiten} / ${k.einheiten} ${tk.einheiten} · ${tk.erwartetLeer}: `}
              <Kennzahl art="erwartetLeerMonat" {...p} /> / {f.betrag(k.erwartetLeerJahr)}
            </>
          }
          ton={k.leereEinheiten > 0 ? "warnung" : undefined}
        />
        <Kachel
          titel={th.mieteBeiVollvermietung}
          wert={
            <>
              {f.betrag(vollvermietung)}
              {k.luecken.erwarteteMiete.fehlend > 0 && <Hinweismarke>{t.allgemein.unvollstaendig}</Hinweismarke>}
            </>
          }
          unter={`${t.allgemein.jahr}: ${f.jahresmiete(vollvermietung)}`}
        />
        <Kachel
          titel={<Begriff k="BAR" t={t}>{tk.bruttoanfangsrendite}</Begriff>}
          wert={<Kennzahl art="bruttoanfangsrendite" {...p} />}
          unter={
            <>
              <Begriff k="Kaufpreisfaktor" t={t}>{tk.kaufpreisfaktor}</Begriff> <Kennzahl art="kaufpreisfaktor" {...p} /> · {tk.sollProM2} {f.betrag(k.sollProM2)}
            </>
          }
        />
        <Kachel titel={tk.rueckstand} wert={f.betrag(k.rueckstand)} ton={k.rueckstand.greaterThan(0) ? "schlecht" : undefined} unter={`${tk.flaeche}: ${f.flaeche(k.flaeche)}`} />
      </Kacheln>

      <Karte titel={th.fotos}>
        {haus.fotos.length === 0 ? (
          <Leer>{th.keineFotos}</Leer>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {haus.fotos.map((foto) => (
              <figure key={foto.id} className="overflow-hidden rounded-lg border border-slate-200">
                <a href={`/api/fotos/${foto.id}`} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element -- Fotos kommen mit Rechteprüfung aus der eigenen Route */}
                  <img src={`/api/fotos/${foto.id}`} alt={foto.beschreibung ?? foto.dateiname} className="aspect-[4/3] w-full object-cover" />
                </a>
                <figcaption className="flex items-center justify-between gap-2 px-2 py-1.5 text-xs text-slate-600">
                  <span className="truncate">{foto.beschreibung ?? foto.dateiname}</span>
                  {schreiben && <Formular aktion={fotoLoeschen.bind(null, foto.id)} absenden={t.allgemein.loeschen} bestaetigen={t.allgemein.loeschenBestaetigen} inline />}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
        {schreiben && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">{th.fotoHochladen}</summary>
            <div className="mt-3">
              <Formular aktion={fotoHochladen.bind(null, id)} absenden={th.fotoHochladen} zuruecksetzen>
                <Felder>
                  <Feld name="datei" label={th.fotoHochladen} typ="file" accept="image/jpeg,image/png,image/webp" hinweis={fuelle(th.fotoHinweis, { mb: MAX_BILD_MB })} pflicht />
                  <Feld name="beschreibung" label={th.beschreibung} />
                </Felder>
              </Formular>
            </div>
          </details>
        )}
      </Karte>

      <Karte titel={<span id="einheiten">{th.einheiten}</span>}>
        {haus.einheiten.length === 0 ? (
          <Leer>{th.keineEinheiten}</Leer>
        ) : (
          <div className="max-h-[36rem] overflow-y-auto">
            <Tabelle>
              <thead className="sticky top-0 bg-white">
                <tr>
                  <th>{t.einheiten.bezeichnung}</th>
                  <th>{t.einheiten.lage}</th>
                  <th className={rechts}>{t.einheiten.flaeche}</th>
                  <th>{t.einheiten.status}</th>
                  <th>{th.mieter}</th>
                  <th className={rechts}>{tk.sollMiete}</th>
                  <th className={rechts}>{tk.istMiete}</th>
                  {schreiben && <th />}
                </tr>
              </thead>
              <tbody>
                {haus.einheiten.map((e) => {
                  const aktiv = e.mietverhaeltnisse.filter((m) => istAktiv({ beginn: isoDatum(m.beginn), ende: isoDatum(m.ende) }, stichtag));
                  const soll = aktiv.reduce((s, m) => s.plus(dezimal(m.sollMiete)), dezimal(0));
                  const ist = aktiv.reduce((s, m) => s.plus(dezimal(m.istMiete)), dezimal(0));
                  const leer = aktiv.length === 0;
                  return (
                    <tr key={e.id} className={leer ? "bg-amber-50/40" : undefined}>
                      <td className="font-medium">
                        {e.bezeichnung}
                        <div className="text-xs font-normal text-slate-500">{t.einheitArten[e.art]}</div>
                      </td>
                      <td>{e.lage}</td>
                      <td className={rechts}>{f.zahl(e.flaeche, 1)}</td>
                      <td>{leer ? <Marke ton="warnung">{th.leer}</Marke> : <Marke ton="gut">{th.vermietet}</Marke>}</td>
                      <td>
                        {leer ? (
                          <span className="text-xs text-slate-500">{e.notiz}</span>
                        ) : (
                          aktiv.map((m, i) => (
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
                          ))
                        )}
                      </td>
                      <td className={rechts}>
                        {leer ? (
                          e.erwarteteMiete ? (
                            <span title={tk.erwartetLeer} className="italic text-slate-500">
                              <MieteZelle monat={f.betrag(e.erwarteteMiete)} jahr={f.jahresmiete(e.erwarteteMiete)} />
                            </span>
                          ) : (
                            "–"
                          )
                        ) : (
                          <MieteZelle monat={f.betrag(soll)} jahr={f.jahresmiete(soll)} />
                        )}
                      </td>
                      <td className={`${rechts} ${!leer && ist.lessThan(soll) ? "text-red-700" : ""}`}>
                        {leer ? "–" : <MieteZelle monat={f.betrag(ist)} jahr={f.jahresmiete(ist)} />}
                      </td>
                      {schreiben && (
                        <td className="whitespace-nowrap text-right">
                          {leer && darf(kontext.rolle, "mieter", "schreiben") && (
                            <Link href={`/mieter/neu?einheit=${e.id}`} className="mr-3 text-xs text-slate-600 hover:underline">
                              {t.mieter.neuesMietverhaeltnis}
                            </Link>
                          )}
                          <Link href={`/haeuser/einheiten/${e.id}`} className="text-xs text-slate-600 hover:underline">
                            {t.allgemein.bearbeiten}
                          </Link>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </Tabelle>
          </div>
        )}
      </Karte>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Karte titel={th.wertentwicklung}>
          {wertverlauf.length > 1 && <Liniendiagramm reihen={[{ name: th.wertentwicklungReihe, punkte: wertverlauf }]} formatY={(w) => f.betragKurz(w)} formatX={(d) => formatMonat(d)} />}
          <Tabelle>
            <thead>
              <tr>
                <th>{t.allgemein.stichtag}</th>
                <th className={rechts}>{th.wert}</th>
                <th>{th.quelle}</th>
                {schreiben && <th />}
              </tr>
            </thead>
            <tbody>
              {haus.verkehrswerte.map((v) => (
                <tr key={v.id}>
                  <td>{f.datum(v.stichtag)}</td>
                  <td className={rechts}>{f.betrag(v.wert)}</td>
                  <td className="text-slate-500">{v.quelle}</td>
                  {schreiben && (
                    <td className="text-right">
                      <Formular aktion={verkehrswertLoeschen.bind(null, v.id)} absenden={t.allgemein.loeschen} bestaetigen={t.allgemein.loeschenBestaetigen} inline />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </Tabelle>
          {schreiben && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">{t.allgemein.hinzufuegen}</summary>
              <div className="mt-3">
                <Formular aktion={verkehrswertHinzufuegen.bind(null, id)} absenden={t.allgemein.speichern} zuruecksetzen>
                  <Felder>
                    <Feld name="stichtag" label={t.allgemein.stichtag} typ="date" wert={stichtag} pflicht />
                    <Feld name="wert" label={th.wert} inputMode="decimal" pflicht />
                    <Feld name="quelle" label={th.quelle} platzhalter="Gutachten" />
                    <Feld name="notiz" label={t.allgemein.notiz} />
                  </Felder>
                </Formular>
              </div>
            </details>
          )}
        </Karte>

        <Karte titel={th.kredite}>
          {haus.kredite.length === 0 ? (
            <Leer>{th.keineKredite}</Leer>
          ) : (
            <Tabelle>
              <thead>
                <tr>
                  <th>{t.kredite.bezeichnung}</th>
                  <th className={rechts}>{t.kredite.anteil}</th>
                  <th className={rechts}>{t.kredite.zinssatzAktuell}</th>
                  <th className={rechts}>{tk.restschuld}</th>
                  <th>{t.kredite.zinsbindung}</th>
                </tr>
              </thead>
              <tbody>
                {haus.kredite.map((x) => {
                  const kd = kredite.find((y) => y.id === x.kredit.id);
                  const anteil = dezimal(x.anteilProzent);
                  return (
                    <tr key={x.id}>
                      <td>
                        {darfGesellschaften && kd ? (
                          <Link href={`/gesellschaften/kredite/${x.kredit.id}`} className="font-medium hover:underline">
                            {x.kredit.bezeichnung}
                          </Link>
                        ) : (
                          <span className="font-medium">{x.kredit.bezeichnung}</span>
                        )}
                        <div className="text-xs text-slate-500">{[x.kredit.bank, x.kredit.kreditnummer].filter(Boolean).join(" · ")}</div>
                      </td>
                      <td className={rechts}>{f.prozent(anteil, 2)}</td>
                      <td className={rechts}>{kd ? <ZinssatzWert k={kd} referenzwerte={referenzwerte} stichtag={stichtag} t={t} f={f} /> : "–"}</td>
                      <td className={rechts}>{kd ? <RestschuldWert nachweis={restschuldNachweis(kd, stichtag)} anteilProzent={anteil} t={t} f={f} /> : "–"}</td>
                      <td>{kd && <ZinsbindungMarke zb={zinsbindung(kd, stichtag)} t={t} f={f} />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </Tabelle>
          )}
        </Karte>
      </div>

      <Karte titel={th.investitionen} aktionen={<span className="text-sm text-slate-600">{th.summeInvestitionen}: {f.betrag(summeInvestitionen)}</span>}>
        {haus.investitionen.length === 0 ? (
          <Leer>{t.allgemein.keineDaten}</Leer>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{t.allgemein.datum}</th>
                <th>{th.kategorie}</th>
                <th>{th.beschreibung}</th>
                <th>{th.einheit}</th>
                <th className={rechts}>{t.allgemein.betrag}</th>
                {schreiben && <th />}
              </tr>
            </thead>
            <tbody>
              {haus.investitionen.map((i) => (
                <tr key={i.id}>
                  <td>{f.datum(i.datum)}</td>
                  <td>{i.kategorie}</td>
                  <td>{i.beschreibung}</td>
                  <td>{i.einheit?.bezeichnung ?? <span className="text-slate-400">{th.ganzesHaus}</span>}</td>
                  <td className={rechts}>{f.betrag(i.betrag)}</td>
                  {schreiben && (
                    <td className="text-right">
                      <Formular aktion={investitionLoeschen.bind(null, i.id)} absenden={t.allgemein.loeschen} bestaetigen={t.allgemein.loeschenBestaetigen} inline />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </Tabelle>
        )}
        {schreiben && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">{t.allgemein.hinzufuegen}</summary>
            <div className="mt-3">
              <Formular aktion={investitionHinzufuegen.bind(null, id)} absenden={t.allgemein.speichern} zuruecksetzen>
                <Felder>
                  <Feld name="datum" label={t.allgemein.datum} typ="date" wert={stichtag} pflicht />
                  <Feld name="betrag" label={t.allgemein.betrag} inputMode="decimal" pflicht />
                  <Feld name="kategorie" label={th.kategorie} platzhalter="Dach, Heizung, …" />
                  <Auswahl
                    name="einheitId"
                    label={th.einheit}
                    leerText={th.ganzesHaus}
                    optionen={haus.einheiten.map((e) => ({ wert: e.id, text: e.bezeichnung }))}
                  />
                  <Feld name="beschreibung" label={th.beschreibung} pflicht breit />
                </Felder>
              </Formular>
            </div>
          </details>
        )}
      </Karte>

      <Karte titel={th.stammdaten}>
        <Angaben
          eintraege={[
            [th.strasse, haus.strasse],
            [`${th.plz} / ${th.ort}`, [haus.plz, haus.ort].filter(Boolean).join(" ")],
            [th.kaufpreis, f.betrag(haus.kaufpreis)],
            [th.kaufdatum, f.datum(haus.kaufdatum)],
            [t.allgemein.notiz, haus.notiz],
          ]}
        />
      </Karte>

      <Glossar begriffe={["Restschuld", "LTV", "DSCR", "JNKM", "NKM", "Leerstand", "BAR", "Kaufpreisfaktor", "Zinsbindung"]} t={t} />
    </div>
  );
}
