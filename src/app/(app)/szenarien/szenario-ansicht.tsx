import { Liniendiagramm } from "@/components/diagramme";
import { Formular } from "@/components/formular";
import { Feld, Felder, Kachel, Kacheln, Karte, Seitenkopf, Tabelle, Textfeld, knopfKlasse, rechts, type Ton } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import type { Kontext } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { idFilter } from "@/lib/auth/sichtbarkeit";
import { alsDbDatum, heute, type IsoDatum } from "@/lib/datum";
import { ladeRechengrundlage } from "@/lib/daten/portfolio";
import { formatierer } from "@/lib/format";
import type { Decimal } from "@/lib/geld";
import { alsJson, basisParameter, rechneSzenario, type SzenarioJahr, type SzenarioParameter } from "@/lib/szenario";
import { szenarioLoeschen, szenarioSpeichern } from "./aktionen";
import { VERKAUF_ZEILEN } from "./eingabe";

const EINGABE = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm shadow-sm";

/**
 * Eingabe, Ergebnis und Speichern eines Szenarios. Rechnen geht über ein GET-Formular (auch für
 * Investoren), Speichern über eine Server-Aktion (nur mit Schreibrecht).
 */
export async function SzenarioAnsicht({
  kontext,
  parameter,
  gesellschaftId,
  gespeichert,
  eingabeFehler,
  aktion,
}: {
  kontext: Kontext;
  parameter: SzenarioParameter;
  gesellschaftId: string | null;
  gespeichert: { id: string; name: string; beschreibung: string | null } | null;
  eingabeFehler: string[];
  /** Ziel des Berechnen-Formulars */
  aktion: string;
}) {
  const t = texte(kontext.mandant.sprache);
  const ts = t.szenarien;
  const f = formatierer(kontext.mandant);
  const stichtag = heute();
  const { haeuser, kredite, referenzwerte, sicht } = await ladeRechengrundlage(kontext, { gesellschaftId: gesellschaftId ?? undefined });
  const [gesellschaften, hausNamen] = await Promise.all([
    kontext.db.gesellschaft.findMany({ where: { id: idFilter(sicht.gesellschaftIds) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    kontext.db.haus.findMany({ where: { id: { in: haeuser.map((h) => h.id) } }, select: { id: true, bezeichnung: true }, orderBy: { bezeichnung: "asc" } }),
  ]);
  const p = { ...parameter, verkaeufe: parameter.verkaeufe.filter((v) => haeuser.some((h) => h.id === v.hausId)) };
  const szenario = rechneSzenario(haeuser, kredite, referenzwerte, stichtag, p);
  const basis = rechneSzenario(haeuser, kredite, referenzwerte, stichtag, basisParameter(p.jahre));
  const schreiben = darf(kontext.rolle, "szenarien", "schreiben");
  const erstes = szenario.jahre[0]?.jahr;
  const letztes = szenario.jahre.at(-1)?.jahr;
  const ende = szenario.jahre.at(-1);
  const endeBasis = basis.jahre.at(-1);
  const dscrMin = (jahre: SzenarioJahr[]) =>
    jahre.reduce<Decimal | null>((m, j) => (j.dscr && (!m || j.dscr.lessThan(m)) ? j.dscr : m), null);
  const diff = (a: Decimal, b: Decimal, format: (d: Decimal) => string) => {
    const d = a.minus(b);
    return d.isZero() ? "±0" : `${d.isPositive() ? "+" : ""}${format(d)}`;
  };
  const ton = (a: Decimal, b: Decimal, hoeherBesser: boolean): Ton | undefined =>
    a.equals(b) ? undefined : a.greaterThan(b) === hoeherBesser ? "gut" : "schlecht";

  const zeilen: Array<{ name: string; wert: (j: SzenarioJahr) => Decimal | null; format: (d: Decimal | null) => string; heute?: string; fett?: boolean }> = [
    { name: ts.sollMieteJahr, wert: (j) => j.sollMiete, format: (d) => f.betragGanz(d), heute: f.betragGanz(szenario.heute.sollMieteJahr) },
    { name: ts.einnahmen, wert: (j) => j.einnahmen, format: (d) => f.betragGanz(d) },
    { name: ts.zinsen, wert: (j) => j.zinsen, format: (d) => f.betragGanz(d) },
    { name: ts.tilgung, wert: (j) => j.tilgung, format: (d) => f.betragGanz(d) },
    { name: ts.kapitaldienst, wert: (j) => j.kapitaldienst, format: (d) => f.betragGanz(d) },
    { name: ts.cashflow, wert: (j) => j.cashflow, format: (d) => f.betragGanz(d), fett: true },
    { name: ts.verkaufNetto, wert: (j) => j.verkaufNetto, format: (d) => f.betragGanz(d) },
    { name: ts.restschuld, wert: (j) => j.restschuld, format: (d) => f.betragGanz(d), heute: f.betragGanz(szenario.heute.restschuld) },
    { name: ts.verkehrswert, wert: (j) => j.verkehrswert, format: (d) => f.betragGanz(d), heute: f.betragGanz(szenario.heute.verkehrswert) },
    { name: ts.ltv, wert: (j) => j.ltv, format: (d) => f.prozent(d, 1), heute: f.prozent(szenario.heute.ltv, 1) },
    { name: ts.dscr, wert: (j) => j.dscr, format: (d) => f.faktor(d) },
  ];
  const feldName: Record<string, string> = {
    jahre: ts.jahre, zins: ts.zins, anschluss: ts.anschluss, miete: ts.miete, ausfall: ts.ausfall, leer: ts.leer,
    wert: ts.wert, kosten: ts.kosten, vfe: ts.vfe, v_datum: ts.verkaufDatum, v_preis: ts.verkaufPreis,
  };
  const zeitraum = erstes && letztes ? fuelle(ts.kumuliert, { von: erstes, bis: letztes }) : "";
  const verkaufZeilen = [...p.verkaeufe, ...Array.from({ length: Math.max(0, VERKAUF_ZEILEN - p.verkaeufe.length) }, () => null)];
  const punkte = (jahre: SzenarioJahr[], wert: (j: SzenarioJahr) => Decimal) => jahre.map((j) => ({ x: `${j.jahr}-12-31` as IsoDatum, y: wert(j) }));

  return (
    <div className="space-y-6">
      <Seitenkopf
        titel={gespeichert?.name ?? ts.neu}
        beschreibung={gespeichert?.beschreibung ?? t.seiten.szenarien}
        zurueck={{ href: "/szenarien", text: ts.titel }}
      />

      <Karte titel={ts.annahmen}>
        <form method="get" action={aktion} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">{ts.bereich}</span>
              <select name="g" defaultValue={gesellschaftId ?? ""} className={EINGABE}>
                <option value="">{ts.portfolio}</option>
                {gesellschaften.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <Feld name="jahre" label={ts.jahre} typ="number" wert={String(p.jahre)} />
            <Feld name="zins" label={ts.zins} wert={f.eingabe(p.zinsVariabelPP)} inputMode="decimal" hinweis={ts.zinsHinweis} />
            <Feld name="anschluss" label={ts.anschluss} wert={p.anschlusszins ? f.eingabe(p.anschlusszins) : ""} inputMode="decimal" hinweis={ts.anschlussHinweis} />
            <Feld name="miete" label={ts.miete} wert={f.eingabe(p.mietsteigerung)} inputMode="decimal" hinweis={ts.mieteHinweis} />
            <Feld name="ausfall" label={ts.ausfall} wert={f.eingabe(p.mietausfall)} inputMode="decimal" />
            <Feld name="leer" label={ts.leer} wert={p.leerVermietenMonate === null ? "" : String(p.leerVermietenMonate)} inputMode="numeric" hinweis={ts.leerHinweis} />
            <Feld name="wert" label={ts.wert} wert={f.eingabe(p.wertentwicklung)} inputMode="decimal" />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">{ts.verkaeufe}</h3>
            <div className="space-y-2">
              {verkaufZeilen.map((v, i) => (
                <div key={i} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <label className="block text-sm">
                    <span className="sr-only">{ts.verkaufHaus}</span>
                    <select name="v_haus" defaultValue={v?.hausId ?? ""} className={EINGABE} aria-label={ts.verkaufHaus}>
                      <option value="">{ts.keinHaus}</option>
                      {hausNamen.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.bezeichnung}
                        </option>
                      ))}
                    </select>
                  </label>
                  <input name="v_datum" type="date" defaultValue={v?.datum ?? ""} aria-label={ts.verkaufDatum} className={EINGABE} />
                  <input name="v_preis" defaultValue={v?.preis ? f.eingabe(v.preis) : ""} placeholder={ts.verkaufPreis} aria-label={ts.verkaufPreis} inputMode="decimal" className={EINGABE} />
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Feld name="kosten" label={ts.kosten} wert={f.eingabe(p.verkaufskosten)} inputMode="decimal" />
              <Feld name="vfe" label={ts.vfe} wert={f.eingabe(p.vorfaelligkeit)} inputMode="decimal" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className={knopfKlasse("primaer")}>
              {ts.berechnen}
            </button>
            <a href={`${aktion}?jahre=${p.jahre}${gesellschaftId ? `&g=${gesellschaftId}` : ""}`} className={knopfKlasse("sekundaer")}>
              {ts.zuruecksetzen}
            </a>
            {eingabeFehler.length > 0 && (
              <span role="alert" className="text-sm text-red-700">
                {fuelle(t.fehler.zahl, { feld: eingabeFehler.map((n) => feldName[n] ?? n).join(", ") })}
              </span>
            )}
          </div>
        </form>
      </Karte>

      {ende && endeBasis && (
        <Kacheln>
          <Kachel
            titel={`${ts.cashflow} · ${zeitraum}`}
            wert={f.betragGanz(szenario.summe.cashflow)}
            unter={`${ts.basis}: ${f.betragGanz(basis.summe.cashflow)} · ${diff(szenario.summe.cashflow, basis.summe.cashflow, (d) => f.betragGanz(d))}`}
            ton={ton(szenario.summe.cashflow, basis.summe.cashflow, true)}
          />
          <Kachel
            titel={`${ts.zinsen} · ${zeitraum}`}
            wert={f.betragGanz(szenario.summe.zinsen)}
            unter={`${ts.basis}: ${f.betragGanz(basis.summe.zinsen)} · ${diff(szenario.summe.zinsen, basis.summe.zinsen, (d) => f.betragGanz(d))}`}
            ton={ton(szenario.summe.zinsen, basis.summe.zinsen, false)}
          />
          <Kachel
            titel={fuelle(ts.restschuldEnde, { jahr: ende.jahr })}
            wert={f.betragGanz(ende.restschuld)}
            unter={`${fuelle(ts.ltvEnde, { jahr: ende.jahr })}: ${f.prozent(ende.ltv, 1)} · ${ts.basis}: ${f.betragGanz(endeBasis.restschuld)}, ${f.prozent(endeBasis.ltv, 1)}`}
          />
          <Kachel
            titel={ts.dscrMin}
            wert={f.faktor(dscrMin(szenario.jahre))}
            unter={`${ts.basis}: ${f.faktor(dscrMin(basis.jahre))}${szenario.summe.verkaufNetto.isZero() ? "" : ` · ${ts.verkaufNetto}: ${f.betragGanz(szenario.summe.verkaufNetto)}`}`}
            ton={(dscrMin(szenario.jahre)?.lessThan(1) ?? false) ? "schlecht" : undefined}
          />
        </Kacheln>
      )}

      <Karte titel={`${ts.ergebnis} · ${ts.vergleichBasis}`}>
        <Tabelle>
          <thead>
            <tr>
              <th />
              <th className={rechts}>{ts.heute}</th>
              {szenario.jahre.map((j) => (
                <th key={j.jahr} className={rechts}>
                  {j.jahr}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {zeilen.map((z) => (
              <tr key={z.name} className={z.fett ? "font-semibold" : undefined}>
                <td className="whitespace-nowrap">{z.name}</td>
                <td className={`${rechts} text-slate-500`}>{z.heute ?? ""}</td>
                {szenario.jahre.map((j, i) => {
                  const w = z.wert(j);
                  const b = z.wert(basis.jahre[i]);
                  const anders = w && b ? !w.toDecimalPlaces(2).equals(b.toDecimalPlaces(2)) : w !== b;
                  return (
                    <td key={j.jahr} className={rechts}>
                      <div>{z.format(w)}</div>
                      {anders && (
                        <div className="text-xs font-normal text-slate-500">
                          {ts.basis} {z.format(b)}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </Tabelle>
        <p className="mt-3 text-xs text-slate-500">
          {ts.cashflowHinweis} {ts.erlaeuterung}
        </p>
      </Karte>

      {szenario.jahre.length > 1 && (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Karte titel={ts.entwicklungCashflow}>
            <Liniendiagramm
              reihen={[
                { name: ts.szenario, punkte: punkte(szenario.jahre, (j) => j.cashflow) },
                { name: ts.basis, punkte: punkte(basis.jahre, (j) => j.cashflow), gestrichelt: true, farbe: "#64748b" },
              ]}
              formatY={(w) => f.betragKurz(w)}
              formatX={(d) => d.slice(0, 4)}
              nullLinie
            />
          </Karte>
          <Karte titel={ts.entwicklungRestschuld}>
            <Liniendiagramm
              reihen={[
                { name: ts.szenario, punkte: [{ x: stichtag, y: szenario.heute.restschuld }, ...punkte(szenario.jahre, (j) => j.restschuld)] },
                { name: ts.basis, punkte: [{ x: stichtag, y: basis.heute.restschuld }, ...punkte(basis.jahre, (j) => j.restschuld)], gestrichelt: true, farbe: "#64748b" },
              ]}
              formatY={(w) => f.betragKurz(w)}
              formatX={(d) => (alsDbDatum(d).getUTCFullYear() === Number(stichtag.slice(0, 4)) ? ts.heute : d.slice(0, 4))}
              ab0
            />
          </Karte>
        </div>
      )}

      {schreiben ? (
        <Karte titel={ts.speichern}>
          <Formular aktion={szenarioSpeichern.bind(null, gespeichert?.id ?? null)} absenden={ts.speichern}>
            <input type="hidden" name="parameterJson" value={JSON.stringify(alsJson(p))} />
            <input type="hidden" name="gesellschaftId" value={gesellschaftId ?? ""} />
            <Felder>
              <Feld name="name" label={ts.name} wert={gespeichert?.name} pflicht />
              <Textfeld name="beschreibung" label={ts.beschreibung} wert={gespeichert?.beschreibung} />
              {gespeichert && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="alsNeu" value="1" className="h-4 w-4" />
                  {ts.speichernAls}
                </label>
              )}
            </Felder>
          </Formular>
          {gespeichert && (
            <div className="mt-4">
              <Formular aktion={szenarioLoeschen.bind(null, gespeichert.id)} absenden={t.allgemein.loeschen} art="gefahr" bestaetigen={t.allgemein.loeschenBestaetigen} />
            </div>
          )}
        </Karte>
      ) : (
        <p className="text-sm text-slate-500">{ts.nurAnsehen}</p>
      )}
    </div>
  );
}
