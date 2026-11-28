/**
 * Liquidität aller sichtbaren Gesellschaften auf einen Blick: je Gesellschaft Anfangsbestand,
 * Einnahmen, Ausgaben, tiefster Bestand und Status; dazu die rechnerische Summe je Monat.
 * Die Gesellschaften sind rechtlich getrennt: die Summe zeigt nur die Größenordnung, Geld ist
 * zwischen ihnen nicht frei verschiebbar. Fehlt bei einer Gesellschaft der Anfangsbestand, ist
 * die Summe unbekannt bzw. als unvollständig gekennzeichnet (nie als 0 ergänzt).
 */
import Link from "next/link";
import { Liniendiagramm } from "@/components/diagramme";
import { Begriff, Hinweismarke, MitHerleitung, Unbekannt } from "@/components/herleitung";
import { Kachel, Kacheln, Karte, Marke, Tabelle, rechts } from "@/components/ui";
import { fuelle, type Texte } from "@/i18n";
import { formatMonat, type IsoDatum } from "@/lib/datum";
import type { LiquiditaetGesellschaft } from "@/lib/daten/liquiditaet";
import type { Formatierer } from "@/lib/format";
import { dezimal, type Decimal } from "@/lib/geld";

export function LiquiditaetUebersicht({ alle, t, f }: { alle: LiquiditaetGesellschaft[]; t: Texte; f: Formatierer }) {
  const tl = t.liquiditaet;
  const tu = tl.uebersicht;
  const betrag = (w: Decimal) => f.betragGanz(w);
  const ohneBestand = alle.filter((g) => g.plan.anfangsbestand.summe === null);
  const mitEngpass = alle.filter((g) => g.plan.ersterEngpass);
  const unterMindest = alle.filter((g) => !g.plan.ersterEngpass && g.plan.ersteUnterschreitung);
  const summe = (wert: (g: LiquiditaetGesellschaft) => Decimal) => alle.reduce((s, g) => s.plus(wert(g)), dezimal(0));
  const anfang = alle.reduce((s, g) => (g.plan.anfangsbestand.summe ? s.plus(g.plan.anfangsbestand.summe) : s), dezimal(0));
  const einnahmen = summe((g) => g.plan.summen.einnahmen);
  const ausgaben = summe((g) => g.plan.summen.ausgaben);

  // Summe je Monat nur über Gesellschaften mit bekanntem Bestand; fehlende werden nicht als 0
  // gezählt, sondern die Reihe ist dann als unvollständig benannt.
  const mitBestand = alle.filter((g) => g.plan.anfangsbestand.summe !== null);
  const monate = [...new Set(mitBestand.flatMap((g) => g.plan.monate.map((m) => m.monat)))].sort() as IsoDatum[];
  const reihe = monate.map((monat) => {
    let y: Decimal | null = dezimal(0);
    for (const g of mitBestand) {
      const m = g.plan.monate.find((x) => x.monat === monat);
      y = y === null || !m || m.bestand === null ? null : y.plus(m.bestand);
    }
    return { x: monat, y };
  });
  const reihenName = ohneBestand.length ? fuelle(tu.reiheSummeTeil, { bekannt: mitBestand.length, gesamt: alle.length }) : tu.reiheSumme;
  const unvollstaendig = ohneBestand.length > 0 ? <Hinweismarke>{t.allgemein.unvollstaendig}</Hinweismarke> : null;
  const fehltText = ohneBestand.map((g) => fuelle(tu.ohneBestand, { gesellschaft: g.name }));

  return (
    <>
      <Kacheln>
        <Kachel titel={tu.gesellschaften} wert={alle.length} unter={fuelle(tu.statusZusammen, { engpass: mitEngpass.length, mindest: unterMindest.length, unbekannt: ohneBestand.length })} />
        <Kachel
          titel={<Begriff k="Liquiditaet" t={t}>{tu.summeAnfang}</Begriff>}
          wert={
            ohneBestand.length === alle.length ? (
              <Unbekannt t={t} grund={tl.keinKontostand} />
            ) : (
              <MitHerleitung
                wert={
                  <>
                    {betrag(anfang)}
                    {unvollstaendig}
                  </>
                }
                herleitung={{
                  berechnung: tu.summeFormel,
                  werte: alle
                    .filter((g) => g.plan.anfangsbestand.summe !== null)
                    .map((g) => [g.name, betrag(g.plan.anfangsbestand.summe!)] as [string, string]),
                  fehlt: fehltText.length ? fehltText : undefined,
                  hinweis: tu.getrennt,
                }}
                t={t}
              />
            )
          }
          unter={tu.getrenntKurz}
        />
        <Kachel titel={tl.kachelEinnahmen} wert={betrag(einnahmen)} unter={tu.zwoelfMonate} />
        <Kachel titel={tl.kachelAusgaben} wert={betrag(ausgaben)} unter={tu.zwoelfMonate} />
      </Kacheln>

      <Karte titel={tu.diagramm}>
        {reihe.some((p) => p.y !== null) ? (
          <Liniendiagramm formatY={(w) => f.betragGanz(w)} formatX={(d) => formatMonat(d)} nullLinie reihen={[{ name: reihenName, punkte: reihe }]} />
        ) : (
          <p className="text-sm text-slate-500">{tu.diagrammUnbekannt}</p>
        )}
        <p className="mt-2 text-xs text-slate-600">{reihenName}</p>
        {ohneBestand.length > 0 && <p className="mt-1 text-xs text-amber-800">{fuelle(tu.diagrammLuecke, { fehlt: ohneBestand.map((g) => g.name).join(", ") })}</p>}
      </Karte>

      <Karte titel={tu.tabelle}>
        <Tabelle>
          <thead>
            <tr>
              <th>{t.listen.gesellschaft}</th>
              <th className={rechts}>{tl.kachelAnfang}</th>
              <th className={rechts}>{tl.kachelEinnahmen}</th>
              <th className={rechts}>{tl.kachelAusgaben}</th>
              <th className={rechts}>{tl.kachelTiefster}</th>
              <th>{tu.status}</th>
            </tr>
          </thead>
          <tbody>
            {alle.map((g) => {
              const p = g.plan;
              const a = p.anfangsbestand;
              return (
                <tr key={g.id} className="hover:bg-slate-50">
                  <td>
                    <Link href={`/liquiditaet?g=${g.id}`} className="font-medium hover:underline">
                      {g.name}
                    </Link>
                  </td>
                  <td className={rechts}>
                    {a.summe === null ? <Unbekannt t={t} grund={tl.keinKontostand} /> : betrag(a.summe)}
                    {a.bisStichtag && <div className="text-xs text-slate-500">{f.datum(a.bisStichtag)}</div>}
                  </td>
                  <td className={rechts}>{betrag(p.summen.einnahmen)}</td>
                  <td className={rechts}>−{betrag(p.summen.ausgaben)}</td>
                  <td className={rechts}>
                    {p.tiefsterBestand ? (
                      <>
                        <span className={p.tiefsterBestand.bestand.lessThan(0) ? "text-red-700" : undefined}>{betrag(p.tiefsterBestand.bestand)}</span>
                        <div className="text-xs text-slate-500">{formatMonat(p.tiefsterBestand.monat)}</div>
                      </>
                    ) : (
                      <span className="text-slate-400">–</span>
                    )}
                  </td>
                  <td>
                    {a.summe === null ? (
                      <Marke ton="warnung">{tu.statusUnbekannt}</Marke>
                    ) : p.ersterEngpass ? (
                      <Marke ton="schlecht">{fuelle(tu.statusEngpass, { monat: formatMonat(p.ersterEngpass) })}</Marke>
                    ) : p.ersteUnterschreitung ? (
                      <Marke ton="warnung">{fuelle(tu.statusMindest, { monat: formatMonat(p.ersteUnterschreitung) })}</Marke>
                    ) : (
                      <Marke ton="gut">{tu.statusOk}</Marke>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {alle.length > 1 && (
            <tfoot>
              <tr>
                <td>{t.allgemein.summe}</td>
                <td className={rechts}>
                  {ohneBestand.length === alle.length ? <Unbekannt t={t} grund={tl.keinKontostand} /> : betrag(anfang)}
                  {unvollstaendig}
                </td>
                <td className={rechts}>{betrag(einnahmen)}</td>
                <td className={rechts}>−{betrag(ausgaben)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </Tabelle>
        <p className="mt-2 text-xs text-slate-500">{tu.getrennt}</p>
      </Karte>
    </>
  );
}
