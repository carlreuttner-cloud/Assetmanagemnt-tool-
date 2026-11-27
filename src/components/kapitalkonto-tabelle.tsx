import Link from "next/link";
import { Begriff, MitHerleitung, Unbekannt } from "@/components/herleitung";
import { Marke, Tabelle, rechts } from "@/components/ui";
import { fuelle, type Texte } from "@/i18n";
import type { Formatierer } from "@/lib/format";
import { dezimal, type Decimal } from "@/lib/geld";
import { anteilEinlagen, anteilWeichtAb, kontosummen, type Bewegung, type Kontosummen } from "@/lib/kapitalkonto";

export type KontoGesellschafter = { id: string; name: string; beteiligungProzent: Decimal | null; bewegungen: Bewegung[] };

/** Kapitalkonten der Gesellschafter einer Gesellschaft mit Summenzeile. */
export function KapitalkontoTabelle({
  gesellschafter,
  stichtag,
  link,
  t,
  f,
}: {
  gesellschafter: KontoGesellschafter[];
  stichtag: string;
  link?: (id: string) => string;
  t: Texte;
  f: Formatierer;
}) {
  const tk = t.kapitalkonten;
  const zeilen = gesellschafter.map((g) => ({ g, s: kontosummen(g.bewegungen) }));
  const alle = kontosummen(gesellschafter.flatMap((g) => g.bewegungen));
  const quelle = tk.quelleText;
  const stand = fuelle(tk.stichtagHeute, { datum: f.datum(stichtag) });
  const betrag = (w: Decimal, formel: string, werte: Array<[string, string]>, s: Kontosummen) => (
    <MitHerleitung
      wert={f.betragGanz(w)}
      herleitung={{
        berechnung: formel,
        werte,
        quelle,
        stichtag: stand,
        hinweis: s.ohneDatum > 0 ? `${fuelle(tk.ohneDatum, { anzahl: s.ohneDatum })}. ${tk.ohneDatumHinweis}` : undefined,
      }}
      t={t}
      ausrichtung="rechts"
    />
  );
  const saldo = (s: Kontosummen) =>
    betrag(
      s.saldo,
      tk.saldoFormel,
      [
        [tk.einlagen, f.betragGanz(s.einlagen)],
        [tk.rueckzahlungen, f.betragGanz(s.rueckzahlungen)],
        [tk.ausschuettungen, f.betragGanz(s.ausschuettungen)],
      ],
      s,
    );
  const einfach = (w: Decimal, s: Kontosummen) => betrag(w, "", [], s);

  return (
    <Tabelle>
      <thead>
        <tr>
          <th>{tk.gesellschafter}</th>
          <th className={rechts}>{tk.beteiligung}</th>
          <th className={rechts}>{tk.anteilEinlagen}</th>
          <th className={rechts}>{tk.einlagen}</th>
          <th className={rechts}>{tk.rueckzahlungen}</th>
          <th className={rechts}>
            <Begriff k="NettoEinlagen" t={t}>{tk.nettoEinlagen}</Begriff>
          </th>
          <th className={rechts}>{tk.ausschuettungen}</th>
          <th className={rechts}>
            <Begriff k="Kapitalsaldo" t={t}>{tk.saldo}</Begriff>
          </th>
        </tr>
      </thead>
      <tbody>
        {zeilen.map(({ g, s }) => {
          const anteil = anteilEinlagen(s.nettoEinlagen, alle.nettoEinlagen);
          const ab = anteilWeichtAb(g.beteiligungProzent, anteil);
          return (
            <tr key={g.id}>
              <td>
                {link ? (
                  <Link href={link(g.id)} className="font-medium hover:underline">
                    {g.name}
                  </Link>
                ) : (
                  <span className="font-medium">{g.name}</span>
                )}
                {s.anzahl === 0 && <div className="text-xs text-amber-700">{tk.keineBewegungen}</div>}
                {s.ohneDatum > 0 && <div className="text-xs text-amber-700">{fuelle(tk.ohneDatum, { anzahl: s.ohneDatum })}</div>}
              </td>
              <td className={rechts}>{g.beteiligungProzent === null ? <Unbekannt t={t} /> : f.prozent(g.beteiligungProzent, 2)}</td>
              <td className={rechts}>
                {anteil === null ? (
                  <Unbekannt t={t} />
                ) : (
                  <MitHerleitung
                    wert={
                      <>
                        {f.prozent(anteil, 2)}
                        {ab && (
                          <>
                            {" "}
                            <Marke ton="warnung">{tk.anteilWeichtAb}</Marke>
                          </>
                        )}
                      </>
                    }
                    herleitung={{
                      berechnung: tk.anteilFormel,
                      werte: [
                        [tk.nettoEinlagen, f.betragGanz(s.nettoEinlagen)],
                        [`${tk.nettoEinlagen} (${tk.summe})`, f.betragGanz(alle.nettoEinlagen)],
                      ],
                      quelle,
                      stichtag: stand,
                      hinweis: ab ? tk.anteilWeichtAbHinweis : undefined,
                    }}
                    t={t}
                    ausrichtung="rechts"
                  />
                )}
              </td>
              <td className={rechts}>{einfach(s.einlagen, s)}</td>
              <td className={rechts}>{einfach(s.rueckzahlungen, s)}</td>
              <td className={rechts}>
                {betrag(
                  s.nettoEinlagen,
                  tk.saldoFormel.split(" − ").slice(0, 2).join(" − "),
                  [
                    [tk.einlagen, f.betragGanz(s.einlagen)],
                    [tk.rueckzahlungen, f.betragGanz(s.rueckzahlungen)],
                  ],
                  s,
                )}
              </td>
              <td className={rechts}>{einfach(s.ausschuettungen, s)}</td>
              <td className={`${rechts} font-semibold`}>{saldo(s)}</td>
            </tr>
          );
        })}
      </tbody>
      {zeilen.length > 1 && (
        <tfoot>
          <tr>
            <td>{tk.summe}</td>
            <td className={rechts}>
              {gesellschafter.every((g) => g.beteiligungProzent !== null)
                ? f.prozent(gesellschafter.reduce((x, g) => x.plus(g.beteiligungProzent!), dezimal(0)), 2)
                : <Unbekannt t={t} />}
            </td>
            <td className={rechts}>{alle.nettoEinlagen.isZero() ? "–" : f.prozent(100, 2)}</td>
            <td className={rechts}>{einfach(alle.einlagen, alle)}</td>
            <td className={rechts}>{einfach(alle.rueckzahlungen, alle)}</td>
            <td className={rechts}>{einfach(alle.nettoEinlagen, alle)}</td>
            <td className={rechts}>{einfach(alle.ausschuettungen, alle)}</td>
            <td className={rechts}>{saldo(alle)}</td>
          </tr>
        </tfoot>
      )}
    </Tabelle>
  );
}
