import Link from "next/link";
import { notFound } from "next/navigation";
import { Formular } from "@/components/formular";
import { CovenantMarke, ZinsbindungMarke } from "@/components/kredit-marken";
import { Jahressaeulen } from "@/components/diagramme";
import { Begriff, Glossar, Hinweismarke, KapitaldienstWert, MitHerleitung, RestschuldWert, Unbekannt, ZinssatzWert, type GlossarBegriff } from "@/components/herleitung";
import { Angaben, Auswahl, Feld, Felder, Kachel, Kacheln, Karte, KnopfLink, Leer, Seitenkopf, Tabelle, rechts } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { heute, isoDatum, monatsanfang, monatsNummer } from "@/lib/datum";
import { erlaubt, ladeRechengrundlage } from "@/lib/daten/portfolio";
import { dezimal } from "@/lib/geld";
import { formatierer } from "@/lib/format";
import { covenantKennzahlen } from "@/lib/kennzahlen";
import {
  gueltigerTilgungsplan,
  kapitaldienstJahr,
  pruefeCovenant,
  restschuldNachweis,
  saldenJahresvergleich,
  sortiereBuchungen,
  zinsbindung,
  zinssatz,
} from "@/lib/kredit";
import {
  buchungHinzufuegen,
  buchungLoeschen,
  covenantHinzufuegen,
  covenantLoeschen,
  saldoHinzufuegen,
  saldoLoeschen,
  tilgungsplanBerechnen,
  tilgungsplanLoeschen,
} from "../../aktionen";

const SICHTBARE_BUCHUNGEN = 24;

/** Covenant-Kennzahl, für die es einen Glossareintrag gibt. */
function glossarBegriff(kennzahl: string): GlossarBegriff | null {
  const k = kennzahl.trim().toUpperCase();
  return k === "LTV" || k === "DSCR" || k === "ICR" ? k : null;
}

export default async function KreditSeite({ params, searchParams }: PageProps<"/gesellschaften/kredite/[id]">) {
  const { id } = await params;
  const { plan: planParam, alle } = await searchParams;
  const kontext = await pruefeZugriff("gesellschaften");
  const t = texte(kontext.mandant.sprache);
  const f = formatierer(kontext.mandant);
  const stichtag = heute();
  const tk = t.kredite;

  const grundlage = await ladeRechengrundlage(kontext);
  const kredit = await kontext.db.kredit.findFirst({
    where: { id, gesellschaftId: erlaubt(grundlage.sicht.gesellschaftIds) },
    include: {
      gesellschaft: { select: { id: true, name: true } },
      haeuser: { include: { haus: { select: { id: true, bezeichnung: true } } } },
      covenants: { orderBy: { kennzahl: "asc" } },
      buchungen: { orderBy: [{ datum: "desc" }] },
      tilgungsplaene: { orderBy: { version: "desc" }, include: { zeilen: { orderBy: { faelligAm: "asc" } } } },
    },
  });
  if (!kredit) notFound();
  const daten = grundlage.kredite.find((k) => k.id === id)!;
  const { haeuser, kredite, referenzwerte } = grundlage;

  const schreiben = darf(kontext.rolle, "gesellschaften", "schreiben");
  const nachweis = restschuldNachweis(daten, stichtag);
  const satz = zinssatz(daten, referenzwerte, stichtag);
  const darlehen = saldenJahresvergleich(daten, "DARLEHEN");
  const guthaben = saldenJahresvergleich(daten, "GUTHABEN");
  const erfassteSalden = [...(daten.salden ?? [])].sort((a, b) => ((a.stichtag ?? "") < (b.stichtag ?? "") ? 1 : -1));
  const kd = kapitaldienstJahr(daten, referenzwerte, stichtag);
  const werte = covenantKennzahlen(daten, haeuser, kredite, referenzwerte, stichtag);

  // Buchungen: neueste zuerst, am selben Tag Tilgung vor Zins (umgekehrte Buchungsreihenfolge)
  const buchungen = sortiereBuchungen(kredit.buchungen.map((b) => ({ ...b, datum: isoDatum(b.datum) }))).reverse();
  const sichtbar = alle ? buchungen : buchungen.slice(0, SICHTBARE_BUCHUNGEN);

  const gueltig = gueltigerTilgungsplan(daten, stichtag);
  const plan = kredit.tilgungsplaene.find((p) => String(p.version) === planParam) ?? kredit.tilgungsplaene.find((p) => p.version === gueltig?.version);
  const neuesteVersion = kredit.tilgungsplaene[0];

  return (
    <div className="space-y-6">
      <Seitenkopf
        titel={kredit.bezeichnung}
        beschreibung={[kredit.bank, kredit.kreditnummer].filter(Boolean).join(" · ")}
        zurueck={{ href: `/gesellschaften/${kredit.gesellschaft.id}`, text: kredit.gesellschaft.name }}
        aktionen={
          schreiben && (
            <>
              {darf(kontext.rolle, "import", "schreiben") && <KnopfLink href="/import?art=kredite">{t.importe.buchungenImportieren}</KnopfLink>}
              <KnopfLink href={`/gesellschaften/kredite/${id}/bearbeiten`}>{t.allgemein.bearbeiten}</KnopfLink>
            </>
          )
        }
      />

      <Kacheln>
        <Kachel
          titel={<Begriff k="Restschuld" t={t}>{t.kennzahlen.restschuld}</Begriff>}
          wert={<RestschuldWert nachweis={nachweis} t={t} f={f} ausrichtung="links" />}
          unter={`${tk.ursprungsbetrag}: ${f.betrag(kredit.ursprungsbetrag)}`}
        />
        <Kachel
          titel={tk.zinssatzAktuell}
          wert={<ZinssatzWert k={daten} referenzwerte={referenzwerte} stichtag={stichtag} t={t} f={f} ausrichtung="links" />}
          unter={kredit.zinsArt === "VARIABEL" ? `${kredit.referenzzins} + ${f.prozent(kredit.marge, 2)}` : t.zinsArten.FEST}
        />
        <Kachel
          titel={<Begriff k="Kapitaldienst" t={t}>{t.kennzahlen.kapitaldienstJahr}</Begriff>}
          wert={<KapitaldienstWert kd={kd} t={t} f={f} ausrichtung="links" />}
          unter={kd ? `${tk.zins} ${f.betrag(kd.zins)} · ${tk.tilgung} ${f.betrag(kd.tilgung)}` : undefined}
        />
        <Kachel
          titel={<Begriff k="Zinsbindung" t={t}>{tk.zinsbindung}</Begriff>}
          wert={<ZinsbindungMarke zb={zinsbindung(daten, stichtag)} t={t} f={f} />}
          unter={kredit.zinsbindungBis ? f.datum(kredit.zinsbindungBis) : undefined}
        />
      </Kacheln>

      <Karte titel={<span id="salden">{tk.salden}</span>}>
        <p className="mb-3 text-xs text-slate-500">{tk.saldenHinweis}</p>
        {darlehen.jahre.length === 0 ? (
          <Leer>{tk.keineSalden}</Leer>
        ) : (
          <div className="space-y-6">
            <div className="max-w-3xl">
              <h3 className="mb-2 text-sm font-medium text-slate-700">{tk.saldenDiagramm}</h3>
              <Jahressaeulen
                jahre={darlehen.jahre.map((j) => ({
                  jahr: j.jahr,
                  wert: j.saldo.betrag,
                  entwurf: j.saldo.status === "ENTWURF",
                  plan: j.plan,
                  titel: `${f.datum(j.saldo.stichtag)} · ${t.saldoQuellen[j.saldo.quelle]}`,
                }))}
                format={(w) => f.betrag(w)}
                formatKurz={(w) => f.betragKurz(w)}
                legende={{ beleg: tk.saldenDiagrammBeleg, entwurf: tk.saldenDiagrammEntwurf, plan: tk.saldenDiagrammPlan }}
              />
            </div>
            <Tabelle>
              <thead>
                <tr>
                  <th>{t.allgemein.jahr}</th>
                  <th>{t.allgemein.stichtag}</th>
                  <th className={rechts}>{t.allgemein.betrag}</th>
                  <th className={rechts}>{tk.saldoVeraenderung}</th>
                  <th className={rechts}>{tk.saldoPlan}</th>
                  <th>{tk.saldoQuelle}</th>
                </tr>
              </thead>
              <tbody>
                {[...darlehen.jahre].reverse().map((j) => (
                  <tr key={j.jahr}>
                    <td className="tabular-nums">{j.jahr}</td>
                    <td className="tabular-nums">{f.datum(j.saldo.stichtag)}</td>
                    <td className={rechts}>
                      {f.betrag(j.saldo.betrag)}
                      {j.saldo.status === "ENTWURF" && (
                        <Hinweismarke>
                          <Begriff k="Entwurf" t={t}>{t.allgemein.entwurf}</Begriff>
                        </Hinweismarke>
                      )}
                      {j.entwuerfe.map((e, i) => (
                        <div key={i} className="text-xs text-slate-500">
                          {fuelle(tk.weitererEntwurf, { betrag: f.betrag(e.betrag), datum: f.datum(e.stichtag) })}
                        </div>
                      ))}
                    </td>
                    <td className={rechts}>{j.veraenderung ? f.betrag(j.veraenderung) : "–"}</td>
                    <td className={`${rechts} text-slate-500`}>{f.betrag(j.plan)}</td>
                    <td className="text-xs text-slate-600">
                      {j.saldo.herkunft === "buchung" ? tk.saldoHerkunftBuchung : t.saldoQuellen[j.saldo.quelle]}
                      {j.saldo.quelleText && <div className="text-slate-500">{j.saldo.quelleText}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabelle>
          </div>
        )}

        {darlehen.unklar.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-2 text-sm font-medium text-amber-800">{tk.saldenUnklar}</h3>
            <Tabelle>
              <tbody>
                {darlehen.unklar.map((x) => (
                  <tr key={x.id}>
                    <td>
                      {tk.stichtagUnklar}
                      {x.stichtagHinweis && <span className="text-slate-500">: {x.stichtagHinweis}</span>}
                    </td>
                    <td className={rechts}>{f.betrag(x.betrag)}</td>
                    <td className="text-xs text-slate-600">
                      {t.saldoQuellen[x.quelle]}
                      {x.quelleText && <div className="text-slate-500">{x.quelleText}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabelle>
          </div>
        )}

        {(guthaben.jahre.length > 0 || guthaben.unklar.length > 0) && (
          <div className="mt-6">
            <h3 className="mb-2 text-sm font-medium text-slate-700">
              <Begriff k="Guthaben" t={t}>{tk.guthaben}</Begriff>
            </h3>
            <Tabelle>
              <tbody>
                {[...guthaben.jahre].reverse().map((j) => (
                  <tr key={j.jahr}>
                    <td className="tabular-nums">{f.datum(j.saldo.stichtag)}</td>
                    <td className={rechts}>
                      {f.betrag(j.saldo.betrag)}
                      {j.saldo.status === "ENTWURF" && <Hinweismarke>{t.allgemein.entwurf}</Hinweismarke>}
                    </td>
                    <td className="text-xs text-slate-600">
                      {t.saldoQuellen[j.saldo.quelle]}
                      {j.saldo.quelleText && <div className="text-slate-500">{j.saldo.quelleText}</div>}
                    </td>
                  </tr>
                ))}
                {guthaben.unklar.map((x) => (
                  <tr key={x.id}>
                    <td>{tk.stichtagUnklar}{x.stichtagHinweis && `: ${x.stichtagHinweis}`}</td>
                    <td className={rechts}>{f.betrag(x.betrag)}</td>
                    <td className="text-xs text-slate-600">{t.saldoQuellen[x.quelle]}</td>
                  </tr>
                ))}
              </tbody>
            </Tabelle>
          </div>
        )}

        {schreiben && (
          <details className="mt-6">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">{tk.saldoNeu}</summary>
            <div className="mt-3">
              <Formular aktion={saldoHinzufuegen.bind(null, id)} absenden={t.allgemein.speichern} zuruecksetzen>
                <Felder>
                  <Feld name="stichtag" label={tk.saldoStichtag} typ="date" />
                  <Feld name="stichtagHinweis" label={tk.saldoStichtagHinweis} />
                  <Feld name="betrag" label={t.allgemein.betrag} inputMode="decimal" pflicht />
                  <Auswahl name="art" label={tk.saldoArt} wert="DARLEHEN" optionen={Object.entries(t.saldoArten).map(([wert, text]) => ({ wert, text }))} pflicht />
                  <Auswahl name="quelle" label={tk.saldoQuelle} optionen={Object.entries(t.saldoQuellen).map(([wert, text]) => ({ wert, text }))} pflicht />
                  <Auswahl name="status" label={tk.saldoStatus} wert="BELEGT" optionen={Object.entries(t.saldoStatus).map(([wert, text]) => ({ wert, text }))} pflicht />
                  <Feld name="quelleText" label={tk.saldoQuelleText} breit />
                  <Feld name="notiz" label={t.allgemein.notiz} breit />
                </Felder>
              </Formular>
            </div>
          </details>
        )}
        {schreiben && erfassteSalden.length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">{fuelle(tk.alleSalden, { anzahl: erfassteSalden.length })}</summary>
            <div className="mt-3">
              <Tabelle>
                <tbody>
                  {erfassteSalden.map((x) => (
                    <tr key={x.id}>
                      <td className="tabular-nums">{x.stichtag ? f.datum(x.stichtag) : `${tk.stichtagUnklar}${x.stichtagHinweis ? `: ${x.stichtagHinweis}` : ""}`}</td>
                      <td>{t.saldoArten[x.art]}</td>
                      <td className={rechts}>{f.betrag(x.betrag)}</td>
                      <td>{t.saldoStatus[x.status]}</td>
                      <td className="text-xs text-slate-600">{t.saldoQuellen[x.quelle]}</td>
                      <td className="text-right">
                        <Formular aktion={saldoLoeschen.bind(null, x.id!)} absenden={t.allgemein.loeschen} art="gefahr" bestaetigen={t.allgemein.loeschenBestaetigen} inline />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Tabelle>
            </div>
          </details>
        )}
      </Karte>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Karte titel={t.gesellschaften.stammdaten}>
          <Angaben
            eintraege={[
              [tk.gesellschaft, <Link key="g" href={`/gesellschaften/${kredit.gesellschaft.id}`} className="hover:underline">{kredit.gesellschaft.name}</Link>],
              [tk.iban, kredit.iban],
              [tk.auszahlungsdatum, f.datum(kredit.auszahlungsdatum)],
              [tk.laufzeitBis, f.datum(kredit.laufzeitBis)],
              [tk.zinsArt, t.zinsArten[kredit.zinsArt]],
              [kredit.zinsArt === "FEST" ? tk.sollzins : tk.referenzzins, kredit.zinsArt === "FEST" ? f.prozent(kredit.sollzins, 3) : `${kredit.referenzzins} + ${f.prozent(kredit.marge, 2)}`],
              [tk.zahlweise, t.zahlweisen[kredit.zahlweise]],
              [tk.tilgungsart, t.tilgungsarten[kredit.tilgungsart]],
              [tk.anfaenglicheTilgung, f.prozent(kredit.anfaenglicheTilgung)],
              [tk.ratenbetrag, f.betrag(kredit.ratenbetrag)],
              [t.allgemein.notiz, kredit.notiz],
            ]}
          />
        </Karte>

        <Karte titel={tk.haeuser}>
          {kredit.haeuser.length === 0 ? (
            <Leer>{t.allgemein.keineDaten}</Leer>
          ) : (
            <Tabelle>
              <thead>
                <tr>
                  <th>{t.allgemein.bezeichnung}</th>
                  <th className={rechts}>{tk.anteil}</th>
                  <th className={rechts}>{t.kennzahlen.restschuld}</th>
                </tr>
              </thead>
              <tbody>
                {kredit.haeuser.map((x) => (
                  <tr key={x.id}>
                    <td>
                      <Link href={`/haeuser/${x.haus.id}`} className="hover:underline">
                        {x.haus.bezeichnung}
                      </Link>
                    </td>
                    <td className={rechts}>{f.prozent(x.anteilProzent, 2)}</td>
                    <td className={rechts}>
                      <RestschuldWert nachweis={nachweis} anteilProzent={dezimal(x.anteilProzent)} t={t} f={f} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabelle>
          )}
        </Karte>
      </div>

      <Karte titel={tk.covenants}>
        <p className="mb-3 text-xs text-slate-500">{tk.covenantHinweis}</p>
        {kredit.covenants.length === 0 ? (
          <Leer>{t.allgemein.keineDaten}</Leer>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{tk.kennzahl}</th>
                <th>{tk.vergleich}</th>
                <th className={rechts}>{tk.schwellenwert}</th>
                <th className={rechts}>{tk.aktuellerWert}</th>
                <th>{tk.status}</th>
                <th>{tk.pruefrhythmus}</th>
                {schreiben && <th />}
              </tr>
            </thead>
            <tbody>
              {kredit.covenants.map((c) => {
                const schwelle = c.schwellenwert ? dezimal(c.schwellenwert) : null;
                const p = pruefeCovenant({ kennzahl: c.kennzahl, vergleich: c.vergleich, schwellenwert: schwelle }, { LTV: werte.ltv, DSCR: werte.dscr, ICR: werte.icr });
                const istProzent = c.kennzahl.toUpperCase() === "LTV";
                const zeige = (w: typeof schwelle) => (istProzent ? f.prozent(w, 1) : f.faktor(w));
                return (
                  <tr key={c.id}>
                    <td className="font-medium">
                      {glossarBegriff(c.kennzahl) ? <Begriff k={glossarBegriff(c.kennzahl)!} t={t}>{c.kennzahl}</Begriff> : c.kennzahl}
                      {c.beschreibung && <div className="text-xs font-normal text-slate-500">{c.beschreibung}</div>}
                    </td>
                    <td>{c.vergleich ? t.vergleiche[c.vergleich] : "–"}</td>
                    <td className={rechts}>{zeige(schwelle)}</td>
                    <td className={rechts}>
                      {p.wert === null ? (
                        <Unbekannt t={t} />
                      ) : (
                        <MitHerleitung
                          wert={zeige(p.wert)}
                          herleitung={{
                            berechnung: t.kredite.covenantHinweis,
                            werte: [
                              [t.kennzahlen.restschuld, f.betrag(werte.restschuld)],
                              [t.kennzahlen.verkehrswert, f.betrag(werte.verkehrswert)],
                              [t.kennzahlen.istMieteJahr, f.betrag(werte.istJahr)],
                              [t.kennzahlen.kapitaldienstJahr, f.betrag(werte.kapitaldienstJahr)],
                            ],
                            stichtag: `${t.herleitung.stichtagAnsicht}: ${f.datum(stichtag)}`,
                          }}
                          t={t}
                          ausrichtung="rechts"
                        />
                      )}
                    </td>
                    <td>
                      <CovenantMarke eingehalten={p.eingehalten} t={t} />
                    </td>
                    <td>{c.pruefrhythmus}</td>
                    {schreiben && (
                      <td className="text-right">
                        <Formular aktion={covenantLoeschen.bind(null, c.id)} absenden={t.allgemein.loeschen} art="gefahr" bestaetigen={t.allgemein.loeschenBestaetigen} inline />
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
            <summary className="cursor-pointer text-sm font-medium text-slate-700">{t.allgemein.hinzufuegen}</summary>
            <div className="mt-3">
              <Formular aktion={covenantHinzufuegen.bind(null, id)} absenden={t.allgemein.hinzufuegen} zuruecksetzen>
                <Felder>
                  <Feld name="kennzahl" label={tk.kennzahl} platzhalter="LTV, DSCR, ICR" pflicht />
                  <Auswahl name="vergleich" label={tk.vergleich} optionen={Object.entries(t.vergleiche).map(([wert, text]) => ({ wert, text }))} leerText="–" />
                  <Feld name="schwellenwert" label={tk.schwellenwert} inputMode="decimal" />
                  <Feld name="pruefrhythmus" label={tk.pruefrhythmus} />
                  <Feld name="beschreibung" label={tk.beschreibung} breit />
                </Felder>
              </Formular>
            </div>
          </details>
        )}
      </Karte>

      <Karte titel={tk.buchungen}>
        {schreiben && (
          <details className="mb-4">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">{tk.buchungNeu}</summary>
            <div className="mt-3">
              <Formular aktion={buchungHinzufuegen.bind(null, id)} absenden={t.allgemein.speichern} zuruecksetzen>
                <Felder>
                  <Feld name="datum" label={t.allgemein.datum} typ="date" pflicht />
                  <Auswahl name="art" label={tk.art} optionen={Object.entries(t.buchungsArten).map(([wert, text]) => ({ wert, text }))} pflicht />
                  <Feld name="betrag" label={t.allgemein.betrag} inputMode="decimal" pflicht />
                  <Feld name="saldoNach" label={tk.saldoNach} inputMode="decimal" />
                  <Feld name="notiz" label={t.allgemein.notiz} breit />
                </Felder>
              </Formular>
            </div>
          </details>
        )}
        {buchungen.length === 0 ? (
          <Leer>{tk.keineBuchungen}</Leer>
        ) : (
          <>
            <Tabelle>
              <thead>
                <tr>
                  <th>{t.allgemein.datum}</th>
                  <th>{tk.art}</th>
                  <th className={rechts}>{t.allgemein.betrag}</th>
                  <th className={rechts}>{tk.saldoNach}</th>
                  <th>{t.allgemein.notiz}</th>
                  {schreiben && <th />}
                </tr>
              </thead>
              <tbody>
                {sichtbar.map((b) => (
                  <tr key={b.id}>
                    <td className="tabular-nums">{f.datum(b.datum)}</td>
                    <td>{t.buchungsArten[b.art]}</td>
                    <td className={rechts}>{f.betrag(b.betrag)}</td>
                    <td className={rechts}>{f.betrag(b.saldoNach)}</td>
                    <td className="text-slate-500">{b.notiz}</td>
                    {schreiben && (
                      <td className="text-right">
                        <Formular aktion={buchungLoeschen.bind(null, b.id)} absenden={t.allgemein.loeschen} art="gefahr" bestaetigen={t.allgemein.loeschenBestaetigen} inline />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Tabelle>
            {!alle && buchungen.length > SICHTBARE_BUCHUNGEN && (
              <Link href={`/gesellschaften/kredite/${id}?alle=1`} className="mt-3 inline-block text-sm text-slate-600 hover:underline">
                {fuelle(tk.alleBuchungen, { anzahl: buchungen.length })}
              </Link>
            )}
          </>
        )}
      </Karte>

      <Glossar begriffe={["Restschuld", "Kapitaldienst", "Zinsbindung", "Covenant", "LTV", "DSCR", "ICR", "Entwurf", "Guthaben"]} t={t} />

      <Karte titel={<span id="tilgungsplaene">{tk.tilgungsplaene}</span>}>
        {kredit.tilgungsplaene.length === 0 ? (
          <Leer>{tk.keinTilgungsplan}</Leer>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap gap-2">
              {kredit.tilgungsplaene.map((p) => (
                <Link
                  key={p.id}
                  href={`/gesellschaften/kredite/${id}?plan=${p.version}#tilgungsplaene`}
                  className={`rounded-md px-3 py-1.5 text-sm ring-1 ring-inset ${p.id === plan?.id ? "bg-slate-900 text-white ring-slate-900" : "ring-slate-300 hover:bg-slate-50"}`}
                >
                  {tk.version} {p.version} · {tk.gueltigAb} {f.datum(p.gueltigAb)}
                  {p.bezeichnung && <span className="opacity-70"> · {p.bezeichnung}</span>}
                </Link>
              ))}
            </div>
            {plan && (
              <div className="max-h-[28rem] overflow-y-auto">
                <Tabelle>
                  <thead className="sticky top-0 bg-white">
                    <tr>
                      <th>{tk.faelligAm}</th>
                      <th className={rechts}>{tk.zins}</th>
                      <th className={rechts}>{tk.tilgung}</th>
                      <th className={rechts}>{tk.rate}</th>
                      <th className={rechts}>{t.kennzahlen.restschuld}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.zeilen.map((z) => (
                      <tr key={z.id} className={isoDatum(z.faelligAm) <= stichtag ? "text-slate-400" : ""}>
                        <td className="tabular-nums">{f.datum(z.faelligAm)}</td>
                        <td className={rechts}>{f.betrag(z.zins)}</td>
                        <td className={rechts}>{f.betrag(z.tilgung)}</td>
                        <td className={rechts}>{f.betrag(z.rate)}</td>
                        <td className={rechts}>{f.betrag(z.restschuld)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Tabelle>
              </div>
            )}
            {schreiben && plan && plan.id === neuesteVersion?.id && kredit.tilgungsplaene.length > 0 && (
              <div className="mt-3">
                <Formular
                  aktion={tilgungsplanLoeschen.bind(null, id, plan.id)}
                  absenden={`${tk.version} ${plan.version} ${t.allgemein.loeschen.toLowerCase()}`}
                  art="gefahr"
                  bestaetigen={t.allgemein.loeschenBestaetigen}
                />
              </div>
            )}
          </>
        )}
        {schreiben && (
          <details className="mt-6">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">{tk.planNeu}</summary>
            <p className="mt-2 text-xs text-slate-500">{tk.planNeuHinweis}</p>
            <div className="mt-3">
              <Formular aktion={tilgungsplanBerechnen.bind(null, id)} absenden={tk.planNeu}>
                <Felder>
                  <Feld name="ab" label={tk.gueltigAb} typ="date" wert={monatsanfang(monatsNummer(stichtag) + 1)} pflicht />
                  <Feld name="bezeichnung" label={t.allgemein.bezeichnung} />
                  <Feld name="zinssatz" label={tk.sollzins} wert={f.eingabe(satz)} inputMode="decimal" pflicht />
                  <Feld name="saldo" label={tk.planStartsaldo} inputMode="decimal" />
                  <Auswahl name="zahlweise" label={tk.zahlweise} wert={kredit.zahlweise} optionen={Object.entries(t.zahlweisen).map(([wert, text]) => ({ wert, text }))} pflicht />
                  <Auswahl name="tilgungsart" label={tk.tilgungsart} wert={kredit.tilgungsart} optionen={Object.entries(t.tilgungsarten).map(([wert, text]) => ({ wert, text }))} pflicht />
                  <Feld name="ratenbetrag" label={tk.ratenbetrag} wert={f.eingabe(kredit.ratenbetrag, 2)} inputMode="decimal" hinweis={tk.ratenbetragHinweis} />
                  <Feld name="tilgungProzent" label={tk.anfaenglicheTilgung} inputMode="decimal" />
                  <Feld name="bis" label={tk.planBis} typ="date" wert={isoDatum(kredit.zinsbindungBis)} />
                </Felder>
              </Formular>
            </div>
          </details>
        )}
      </Karte>
    </div>
  );
}
