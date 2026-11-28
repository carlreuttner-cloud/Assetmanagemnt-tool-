import { Formular } from "@/components/formular";
import { Begriff, MitHerleitung } from "@/components/herleitung";
import { Ankreuzfeld, Auswahl, Feld, Felder, Karte, Leer, Marke, Tabelle, rechts } from "@/components/ui";
import { fuelle, type Texte } from "@/i18n";
import type { Formatierer } from "@/lib/format";
import { sondertilgung, sondertilgungRegel, type SondertilgungEingabe } from "@/lib/sondertilgung";
import { sondertilgungSetzen } from "../../aktionen";

/** Sondertilgungsrecht eines Kredits: Jahre mit erlaubt, genutzt und offen, Formular zum Erfassen. */
export function SondertilgungKarte({ kreditId, eingabe, stichtag, schreiben, t, f }: { kreditId: string; eingabe: SondertilgungEingabe; stichtag: string; schreiben: boolean; t: Texte; f: Formatierer }) {
  const ts = t.sondertilgung;
  const erg = sondertilgung(eingabe, stichtag);
  const optionen = <T extends Record<string, string>>(werte: T) => Object.entries(werte).map(([wert, text]) => ({ wert, text }));
  const zeitraum = (von: string, bis: string) => `${f.datum(von)} – ${f.datum(bis)}`;
  return (
    <Karte titel={<span id="sondertilgung"><Begriff k="Sondertilgungsrecht" t={t}>{ts.karte}</Begriff></span>}>
      {erg.art === "unbekannt" ? (
        <p className="text-sm text-amber-700" data-sondertilgung="unbekannt">{ts.unbekannt[erg.grund]}</p>
      ) : erg.art === "keines" ? (
        <p className="text-sm text-slate-600" data-sondertilgung="keines">{ts.keines}</p>
      ) : (
        <div data-sondertilgung="recht">
          <p className="mb-3 text-sm text-slate-700">
            {sondertilgungRegel(eingabe, ts, f)} · {erg.gueltigBis ? fuelle(ts.gueltigBis, { datum: f.datum(erg.gueltigBis) }) : ts.gueltigOffen}
            {eingabe.uebertragbar && <> · {ts.uebertragbar}</>}
          </p>
          {erg.gueltigBis && erg.gueltigBis < stichtag && <p className="mb-3 text-sm text-slate-500">{fuelle(ts.abgelaufen, { datum: f.datum(erg.gueltigBis) })}</p>}
          {erg.jahre.length === 0 ? (
            <Leer>{ts.keinLaufendes}</Leer>
          ) : (
            <Tabelle>
              <thead>
                <tr>
                  <th>{ts.spalten.zeitraum}</th>
                  <th className={rechts}>{ts.spalten.erlaubt}</th>
                  {eingabe.uebertragbar && <th className={rechts}>{ts.spalten.uebertrag}</th>}
                  <th className={rechts}>{ts.spalten.genutzt}</th>
                  <th className={rechts}>{ts.spalten.offen}</th>
                </tr>
              </thead>
              <tbody>
                {[...erg.jahre].reverse().map((j) => (
                  <tr key={j.von} data-st-jahr={j.von.slice(0, 4)}>
                    <td>
                      {zeitraum(j.von, j.bis)} {j.laufend && <Marke ton="gut">{ts.laufend}</Marke>}
                    </td>
                    <td className={rechts}>{f.betragGanz(j.erlaubt)}</td>
                    {eingabe.uebertragbar && <td className={rechts}>{f.betragGanz(j.uebertrag)}</td>}
                    <td className={rechts}>
                      <MitHerleitung wert={f.betragGanz(j.genutzt)} herleitung={{ berechnung: ts.quelle, werte: [[ts.spalten.buchungen, String(j.buchungen)]], stichtag: zeitraum(j.von, j.bis) }} t={t} ausrichtung="rechts" />
                      {j.ueberschritten.greaterThan(0) && <div className="text-xs text-red-700">{fuelle(ts.ueberschritten, { betrag: f.betragGanz(j.ueberschritten) })}</div>}
                    </td>
                    <td className={rechts}>
                      <MitHerleitung
                        wert={<span className={j.laufend && j.offen.greaterThan(0) ? "font-medium text-emerald-700" : undefined}>{f.betragGanz(j.offen)}</span>}
                        herleitung={{ berechnung: ts.herleitungOffen, werte: [[ts.spalten.erlaubt, f.betragGanz(j.erlaubt)], [ts.spalten.uebertrag, f.betragGanz(j.uebertrag)], [ts.spalten.genutzt, f.betragGanz(j.genutzt)]] }}
                        t={t}
                        ausrichtung="rechts"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabelle>
          )}
        </div>
      )}
      {erg.art !== "recht" && erg.genutzt.greaterThan(0) && <p className="mt-2 text-sm text-slate-600">{fuelle(ts.genutztGesamt, { betrag: f.betragGanz(erg.genutzt) })}</p>}
      {schreiben && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm text-sky-700">{ts.bearbeiten}</summary>
          <Formular aktion={sondertilgungSetzen.bind(null, kreditId)} absenden={t.allgemein.speichern} className="mt-3 space-y-3">
            <Felder>
              <Auswahl name="recht" label={ts.recht} wert={eingabe.recht} optionen={optionen(ts.rechte)} pflicht />
              <Feld name="wert" label={ts.wert} wert={f.eingabe(eingabe.wert, eingabe.recht === "BETRAG" ? 2 : undefined)} inputMode="decimal" hinweis={ts.wertHinweis} />
              <Auswahl name="jahr" label={ts.jahr} wert={eingabe.jahr} optionen={optionen(ts.jahre)} pflicht />
              <Feld name="bis" label={ts.bis} typ="date" wert={eingabe.bis ?? undefined} hinweis={ts.bisHinweis} />
            </Felder>
            <Ankreuzfeld name="uebertragbar" label={ts.uebertragbar} wert={eingabe.uebertragbar} />
          </Formular>
        </details>
      )}
    </Karte>
  );
}
