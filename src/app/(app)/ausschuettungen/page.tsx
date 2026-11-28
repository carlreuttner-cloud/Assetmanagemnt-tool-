import Link from "next/link";
import { Formular } from "@/components/formular";
import { Begriff, Glossar, MitHerleitung, Unbekannt } from "@/components/herleitung";
import { Auswahl, Feld, Felder, Kachel, Kacheln, Karte, Leer, Marke, Seitenkopf, Tabelle, rechts, type Ton } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { pruefeAusschuettung, spielraum, verteilung, type BedingungPruefung, type BedingungStatus, type Gesamt } from "@/lib/ausschuettung";
import { covenantPuffer, sperrenStatus } from "@/lib/covenant";
import { formatMonat, heute } from "@/lib/datum";
import { ladeLiquiditaet } from "@/lib/daten/liquiditaet";
import { ladeRechengrundlage } from "@/lib/daten/portfolio";
import { formatierer } from "@/lib/format";
import { dezimal, type Decimal } from "@/lib/geld";
import { covenantKennzahlen } from "@/lib/kennzahlen";
import { planpositionLoeschen } from "../liquiditaet/aktionen";
import { ausschuettungPlanen } from "./aktionen";

const GESAMT_TON: Record<Gesamt, Ton> = { moeglich: "gut", pruefen: "warnung", blockiert: "schlecht" };
const BEDINGUNG_TON: Record<BedingungStatus | "keine", Ton> = { frei: "gut", aktiv: "schlecht", manuell: "warnung", keine: "neutral" };

export default async function AusschuettungenSeite() {
  const kontext = await pruefeZugriff("gesellschaften");
  const t = texte(kontext.mandant.sprache);
  const ta = t.ausschuettung;
  const f = formatierer(kontext.mandant);
  const stichtag = heute();
  const schreiben = darf(kontext.rolle, "gesellschaften", "schreiben");
  const basis = await ladeRechengrundlage(kontext, { bereich: true });
  const sichtbar = await kontext.db.gesellschaft.findMany({ where: basis.sicht.gesellschaftIds === "alle" ? {} : { id: { in: basis.sicht.gesellschaftIds } }, select: { id: true } });
  const ids = sichtbar.map((g) => g.id);
  const [alle, gesellschafter, covenants] = await Promise.all([
    ladeLiquiditaet(kontext, basis, ids, stichtag),
    kontext.db.gesellschafter.findMany({ where: { gesellschaftId: { in: ids } }, orderBy: { name: "asc" }, select: { id: true, name: true, gesellschaftId: true, beteiligungProzent: true } }),
    kontext.db.covenant.findMany({ where: { kreditId: { in: basis.kredite.map((k) => k.id) } }, select: { kreditId: true, kennzahl: true, folge: true, vergleich: true, schwellenwert: true } }),
  ]);
  const kreditName = new Map(basis.kredite.map((k) => [k.id, k.bezeichnung]));

  // Sperren und Covenants je Gesellschaft, Stand heute
  const bedingungen = new Map<string, { sperren: BedingungPruefung[]; covenants: BedingungPruefung[] }>();
  for (const g of ids) bedingungen.set(g, { sperren: [], covenants: [] });
  for (const k of basis.kredite) {
    const eigene = covenants.filter((c) => c.kreditId === k.id);
    if (eigene.length === 0) continue;
    const kz = covenantKennzahlen(k, basis.haeuser, basis.kredite, basis.referenzwerte, stichtag);
    for (const c of eigene) {
      const puffer = covenantPuffer({ kennzahl: c.kennzahl, vergleich: c.vergleich, schwellenwert: c.schwellenwert === null ? null : dezimal(c.schwellenwert) }, kz);
      const b = { kreditId: k.id, kennzahl: c.kennzahl, status: sperrenStatus(puffer) };
      const ziel = bedingungen.get(k.gesellschaftId);
      if (ziel) (c.folge === "AUSSCHUETTUNGSSPERRE" ? ziel.sperren : ziel.covenants).push(b);
    }
  }

  const zeilen = alle
    .flatMap((g) => g.positionen.filter((p) => p.art === "AUSSCHUETTUNG").map((p) => ({ g, p, pruefung: pruefeAusschuettung(g.plan, p.monat, p.betrag, bedingungen.get(g.id)!.sperren, bedingungen.get(g.id)!.covenants) })))
    .sort((a, b) => (a.p.monat === b.p.monat ? a.g.name.localeCompare(b.g.name, "de") : a.p.monat < b.p.monat ? -1 : 1));
  const summe = zeilen.reduce((s, z) => s.plus(z.p.betrag), dezimal(0));
  const anzahl = (x: Gesamt) => zeilen.filter((z) => z.pruefung.gesamt === x).length;

  const bedingungListe = (liste: BedingungPruefung[], status: BedingungStatus | "keine", texte: Record<BedingungStatus | "keine", string> = ta.bedingung) => (
    <span className="inline-flex flex-col gap-0.5">
      <Marke ton={BEDINGUNG_TON[status]}>{texte[status]}</Marke>
      {liste.map((b, i) => (
        <span key={i} className="text-xs text-slate-500">
          <Link href={`/gesellschaften/kredite/${b.kreditId}`} className="hover:underline">
            {kreditName.get(b.kreditId)}
          </Link>{" "}
          · {b.kennzahl}: {ta.bedingung[b.status]}
        </span>
      ))}
    </span>
  );
  const monatText = (m: string) => formatMonat(m, f.sprache);

  return (
    <div className="max-w-7xl space-y-6">
      <Seitenkopf titel={t.navigation.ausschuettungen} beschreibung={t.seiten.ausschuettungen} />

      <Kacheln>
        <Kachel titel={ta.kacheln.summe} wert={f.betragGanz(summe)} unter={fuelle(ta.anzahl, { anzahl: zeilen.length })} />
        <Kachel titel={ta.kacheln.moeglich} wert={anzahl("moeglich")} ton={anzahl("moeglich") > 0 ? "gut" : undefined} />
        <Kachel titel={ta.kacheln.pruefen} wert={anzahl("pruefen")} ton={anzahl("pruefen") > 0 ? "warnung" : undefined} />
        <Kachel titel={ta.kacheln.blockiert} wert={anzahl("blockiert")} ton={anzahl("blockiert") > 0 ? "schlecht" : undefined} />
      </Kacheln>

      <Karte titel={ta.geplant}>
        <p className="mb-3 text-xs text-slate-500">{fuelle(ta.stand, { datum: f.datum(stichtag) })}</p>
        {zeilen.length === 0 ? (
          <Leer>{ta.keine}</Leer>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{ta.spalten.monat}</th>
                <th>{ta.spalten.gesellschaft}</th>
                <th className={rechts}>{ta.spalten.betrag}</th>
                <th>
                  <Begriff k="Liquiditaet" t={t}>{ta.spalten.liquiditaet}</Begriff>
                </th>
                <th>
                  <Begriff k="Ausschuettungssperre" t={t}>{ta.spalten.sperren}</Begriff>
                </th>
                <th>
                  <Begriff k="Covenant" t={t}>{ta.spalten.covenants}</Begriff>
                </th>
                <th>{ta.spalten.ergebnis}</th>
                {schreiben && <th />}
              </tr>
            </thead>
            <tbody>
              {zeilen.map(({ g, p, pruefung }) => {
                const l = pruefung.liquiditaet;
                const anteile = verteilung(p.betrag, gesellschafter.filter((x) => x.gesellschaftId === g.id).map((x) => ({ ...x, beteiligungProzent: x.beteiligungProzent === null ? null : dezimal(x.beteiligungProzent) })));
                return (
                  <tr key={p.id} data-ausschuettung={pruefung.gesamt}>
                    <td className="whitespace-nowrap">{monatText(p.monat)}</td>
                    <td>
                      <Link href={`/liquiditaet?g=${g.id}`} className="font-medium hover:underline">
                        {g.name}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {p.bezeichnung}
                        {p.quelle && ` · ${p.quelle}`}
                      </div>
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-sky-700">{ta.verteilung}</summary>
                        {anteile.zeilen.length === 0 ? (
                          <p className="text-xs italic text-slate-500">{ta.keineGesellschafter}</p>
                        ) : (
                          <ul className="mt-1 text-xs">
                            {anteile.zeilen.map((z) => (
                              <li key={z.id}>
                                {z.name}: {z.betrag === null ? <Unbekannt t={t} grund={ta.beteiligungUnbekannt} /> : `${f.betragGanz(z.betrag)} (${f.prozent(z.beteiligungProzent, 2)})`}
                              </li>
                            ))}
                            {!anteile.vollstaendig && <li className="text-amber-700">{fuelle(ta.verteilungUnvollstaendig, { summe: anteile.summeProzent === null ? t.allgemein.unbekannt : f.prozent(anteile.summeProzent, 2) })}</li>}
                          </ul>
                        )}
                      </details>
                    </td>
                    <td className={rechts}>{f.betragGanz(p.betrag)}</td>
                    <td>
                      {l.status === "ok" || l.status === "unterMindest" || l.status === "engpass" ? (
                        <span className="inline-flex flex-col gap-0.5">
                          <Marke ton={l.status === "ok" ? "gut" : l.status === "engpass" ? "schlecht" : "warnung"}>{ta.liquiditaet[l.status]}</Marke>
                          <span className="text-xs text-slate-600">
                            <MitHerleitung
                              wert={fuelle(ta.hoechstens, { betrag: f.betragGanz(l.hoechstens.isNegative() ? dezimal(0) : l.hoechstens) })}
                              herleitung={{
                                berechnung: ta.herleitungLiquiditaet,
                                werte: [
                                  [ta.spaltenSpielraum.tiefster, `${f.betragGanz(l.tiefster.bestand)} (${monatText(l.tiefster.monat)})`],
                                  [t.glossar.Mindestliquiditaet.kurz, g.mindestliquiditaet ? f.betragGanz(g.mindestliquiditaet) : ta.keineMindest],
                                  [ta.spalten.betrag, f.betragGanz(p.betrag)],
                                ],
                                stichtag: g.plan.anfangsbestand.bisStichtag ? f.datum(g.plan.anfangsbestand.bisStichtag) : undefined,
                              }}
                              t={t}
                            />
                          </span>
                        </span>
                      ) : (
                        <Marke ton="warnung">{ta.liquiditaet[l.status]}</Marke>
                      )}
                    </td>
                    <td>{bedingungListe(pruefung.sperren, pruefung.sperreStatus, ta.sperre)}</td>
                    <td>{bedingungListe(pruefung.covenants, pruefung.covenantStatus)}</td>
                    <td>
                      <Marke ton={GESAMT_TON[pruefung.gesamt]}>{ta.gesamt[pruefung.gesamt]}</Marke>
                    </td>
                    {schreiben && (
                      <td className="text-right">
                        <Formular aktion={planpositionLoeschen.bind(null, g.id, p.id)} absenden={ta.loeschen} bestaetigen={ta.loeschenFrage} art="gefahr" inline />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </Tabelle>
        )}
      </Karte>

      <Karte titel={<Begriff k="Ausschuettungsspielraum" t={t}>{ta.spielraum}</Begriff>}>
        <p className="mb-3 text-sm text-slate-600">{ta.spielraumHinweis}</p>
        <Tabelle>
          <thead>
            <tr>
              <th>{ta.spaltenSpielraum.gesellschaft}</th>
              <th className={rechts}>
                <Begriff k="Mindestliquiditaet" t={t}>{ta.spaltenSpielraum.mindest}</Begriff>
              </th>
              <th className={rechts}>{ta.spaltenSpielraum.tiefster}</th>
              <th className={rechts}>{ta.spaltenSpielraum.spielraum}</th>
              <th>{ta.spaltenSpielraum.sperren}</th>
            </tr>
          </thead>
          <tbody>
            {alle.map((g) => {
              const s = spielraum(g.plan, g.plan.beginn);
              const b = bedingungen.get(g.id)!;
              const gesperrt = b.sperren.some((x) => x.status === "aktiv") || b.covenants.some((x) => x.status === "aktiv");
              return (
                <tr key={g.id} data-spielraum={g.name}>
                  <td>
                    <Link href={`/liquiditaet?g=${g.id}`} className="font-medium hover:underline">
                      {g.name}
                    </Link>
                    <div className="text-xs text-slate-500">{monatText(g.plan.beginn)}</div>
                  </td>
                  <td className={rechts}>{g.mindestliquiditaet ? f.betragGanz(g.mindestliquiditaet) : <span className="italic text-slate-400">{ta.keineMindest}</span>}</td>
                  <td className={rechts}>{s ? `${f.betragGanz(s.tiefster.bestand)} (${monatText(s.tiefster.monat)})` : <Unbekannt t={t} grund={ta.liquiditaet.unbekannt} />}</td>
                  <td className={rechts}>{s ? <SpielraumWert betrag={s.betrag} gesperrt={gesperrt} f={f} text={ta.sperreAktiv} /> : <Unbekannt t={t} />}</td>
                  <td>
                    {b.sperren.length + b.covenants.length === 0 ? (
                      <span className="text-xs text-slate-400">{ta.bedingung.keine}</span>
                    ) : (
                      bedingungListe([...b.sperren, ...b.covenants], [...b.sperren, ...b.covenants].some((x) => x.status === "aktiv") ? "aktiv" : [...b.sperren, ...b.covenants].some((x) => x.status === "manuell") ? "manuell" : "frei")
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Tabelle>
      </Karte>

      {schreiben && alle.length > 0 && (
        <Karte titel={ta.planen}>
          <p className="mb-3 text-sm text-slate-600">{ta.planenHinweis}</p>
          <Formular aktion={ausschuettungPlanen} absenden={ta.speichern} zuruecksetzen>
            <Felder>
              <Auswahl name="gesellschaftId" label={ta.gesellschaft} optionen={alle.map((g) => ({ wert: g.id, text: g.name }))} pflicht />
              <Feld name="monat" label={ta.monat} typ="date" pflicht />
              <Feld name="betrag" label={ta.betrag} inputMode="decimal" pflicht />
              <Feld name="bezeichnung" label={ta.bezeichnung} platzhalter={ta.bezeichnungVorgabe} />
              <Feld name="quelle" label={ta.quelle} breit />
            </Felder>
          </Formular>
        </Karte>
      )}

      <Glossar begriffe={["Ausschuettungssperre", "Covenant", "Liquiditaet", "Mindestliquiditaet", "Ausschuettungsspielraum"]} t={t} />
    </div>
  );
}

function SpielraumWert({ betrag, gesperrt, f, text }: { betrag: Decimal; gesperrt: boolean; f: ReturnType<typeof formatierer>; text: string }) {
  return (
    <span className={betrag.isNegative() ? "text-red-700" : gesperrt ? "text-amber-700" : "text-emerald-700"}>
      {f.betragGanz(betrag)}
      {gesperrt && <div className="text-xs">{text}</div>}
    </span>
  );
}
