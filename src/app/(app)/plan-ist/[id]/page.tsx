import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Jahressaeulen } from "@/components/diagramme";
import { Formular } from "@/components/formular";
import {
  Begriff,
  Glossar,
  MitHerleitung,
  Unbekannt,
} from "@/components/herleitung";
import {
  Angaben,
  Auswahl,
  Feld,
  Felder,
  Kachel,
  Kacheln,
  Karte,
  KnopfLink,
  Marke,
  Seitenkopf,
  Tabelle,
  Textfeld,
  rechts,
  type Ton,
} from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { ladeGeschaeftsjahre } from "@/lib/daten/finanzen";
import { ladePlanjahre } from "@/lib/daten/plan-ist";
import { GUV_POSTEN } from "@/lib/finanzen";
import { formatierer } from "@/lib/format";
import {
  istStufe,
  SCHWELLE_BETRAG,
  SCHWELLE_PROZENT,
  STUFEN_TEILE,
  zeilenwerte,
  type PlanZeile,
  type Wirkung,
} from "@/lib/plan-ist";
import { erklaerungSpeichern, planLoeschen, planSpeichern } from "../aktionen";

const WIRKUNG_TON: Record<Wirkung, Ton> = {
  guenstig: "gut",
  unguenstig: "schlecht",
  keine: "neutral",
};

export default async function PlanjahrSeite({
  params,
}: PageProps<"/plan-ist/[id]">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("gesellschaften");
  const t = texte(kontext.mandant.sprache);
  const tp = t.planIst;
  const f = formatierer(kontext.mandant);
  const schreiben = darf(kontext.rolle, "gesellschaften", "schreiben");
  const [p] = await ladePlanjahre(kontext, { id });
  if (!p) notFound();
  const [alle, abschluesse] = await Promise.all([
    ladePlanjahre(kontext, { gesellschaftId: p.gesellschaftId }),
    ladeGeschaeftsjahre(kontext, p.gesellschaftId),
  ]);

  const e = p.ergebnis;
  const ebitda = e.zeilen.find((z) => z.zeile === "ebitda")!;
  const istQuelle = p.ist
    ? (p.ist.quelleText ??
      t.abschlussQuellen[p.ist.quelle as keyof typeof t.abschlussQuellen])
    : null;
  const planQuelle = [
    p.quelle,
    tp.stati[p.status],
    p.beschlossenAm ? `${tp.beschlossenAm} ${f.datum(p.beschlossenAm)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const name = (z: PlanZeile): ReactNode =>
    istStufe(z) ? (
      <Begriff
        k={z === "ebitda" ? "EBITDA" : z === "ebit" ? "EBIT" : "EBT"}
        t={t}
      />
    ) : (
      t.finanzen.posten[z]
    );
  const nameText = (z: PlanZeile) =>
    istStufe(z)
      ? t.glossar[z === "ebitda" ? "EBITDA" : z === "ebit" ? "EBIT" : "EBT"]
          .kurz
      : t.finanzen.posten[z];
  const planWerte = zeilenwerte(p.plan);
  const istWerte = p.ist ? zeilenwerte(p.ist.werte) : null;
  const wert = (w: ReturnType<typeof zeilenwerte>[PlanZeile] | undefined) =>
    w == null ? "–" : f.betragGanz(w);

  const jahre = [
    ...new Set([...alle.map((x) => x.jahr), ...abschluesse.map((a) => a.jahr)]),
  ].sort((a, b) => a - b);
  const saeulen = jahre.map((j) => {
    const a = abschluesse.find((x) => x.jahr === j);
    const pl = alle.find((x) => x.jahr === j);
    return {
      jahr: j,
      wert: a
        ? zeilenwerte(
            Object.fromEntries(GUV_POSTEN.map((k) => [k, a[k]])) as Parameters<
              typeof zeilenwerte
            >[0],
          ).ebitda
        : null,
      entwurf: a?.status === "ENTWURF",
      plan: pl ? zeilenwerte(pl.plan).ebitda : null,
    };
  });

  return (
    <div className="max-w-6xl space-y-6">
      <Seitenkopf
        titel={`${tp.planQuelle} ${p.jahr}`}
        beschreibung={p.gesellschaft}
        zurueck={{ href: "/plan-ist", text: tp.alle }}
        aktionen={
          <KnopfLink
            href={
              p.ist
                ? `/gesellschaften/${p.gesellschaftId}/finanzen/${p.ist.id}`
                : `/gesellschaften/${p.gesellschaftId}/finanzen/neu`
            }
          >
            {p.ist ? tp.zumAbschluss : tp.abschlussErfassen}
          </KnopfLink>
        }
      />
      <Kacheln>
        <Kachel
          titel={tp.spalten.ebitdaPlan}
          wert={
            ebitda.plan === null ? (
              <Unbekannt t={t} />
            ) : (
              f.betragGanz(ebitda.plan)
            )
          }
        />
        <Kachel
          titel={tp.spalten.ebitdaIst}
          wert={
            ebitda.ist === null ? <Unbekannt t={t} /> : f.betragGanz(ebitda.ist)
          }
          unter={
            p.ist?.status === "ENTWURF" ? t.abschlussStatus.ENTWURF : undefined
          }
        />
        <Kachel
          titel={`${tp.spalten.abweichung} EBITDA`}
          wert={
            ebitda.betrag === null ? (
              <Unbekannt t={t} />
            ) : (
              f.betragGanz(ebitda.betrag)
            )
          }
          ton={
            ebitda.wirkung === "unguenstig"
              ? "schlecht"
              : ebitda.wirkung === "guenstig"
                ? "gut"
                : undefined
          }
          unter={ebitda.prozent ? f.prozent(ebitda.prozent, 1) : undefined}
        />
        <Kachel
          titel={tp.kacheln.wesentlich}
          wert={e.wesentlich}
          ton={e.ohneErklaerung > 0 ? "warnung" : undefined}
          unter={
            e.ohneErklaerung > 0
              ? fuelle(tp.erklaerungFehltAnzahl, { anzahl: e.ohneErklaerung })
              : undefined
          }
        />
      </Kacheln>

      {!p.ist && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {fuelle(tp.istFehlt, { jahr: p.jahr })}
        </p>
      )}
      {p.ist?.status === "ENTWURF" && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {tp.istEntwurf}
        </p>
      )}

      <Karte titel={tp.stand}>
        <Angaben
          eintraege={[
            [
              tp.gesellschaft,
              <Link
                key="g"
                href={`/gesellschaften/${p.gesellschaftId}/finanzen`}
                className="hover:underline"
              >
                {p.gesellschaft}
              </Link>,
            ],
            [tp.planQuelle, planQuelle],
            [
              tp.istQuelle,
              p.ist
                ? `${istQuelle} · ${t.herleitung.stichtag} ${f.datum(p.ist.ende)}${p.ist.status === "ENTWURF" ? ` · ${t.abschlussStatus.ENTWURF}` : ""}`
                : null,
            ],
            [t.allgemein.notiz, p.notiz],
            [tp.erstelltVon, p.erstelltVon],
          ]}
        />
      </Karte>

      <Karte titel={tp.vergleich}>
        <p className="-mt-2 mb-3 text-xs text-slate-500">
          {fuelle(tp.schwelle, {
            prozent: f.prozent(SCHWELLE_PROZENT, 0),
            betrag: f.betragGanz(SCHWELLE_BETRAG),
          })}
        </p>
        <Tabelle>
          <thead>
            <tr>
              <th>{tp.spalten.zeile}</th>
              <th className={rechts}>{tp.planQuelle}</th>
              <th className={rechts}>{tp.istQuelle}</th>
              <th className={rechts}>{tp.spalten.abweichung}</th>
              <th className={rechts}>{tp.spalten.prozent}</th>
              <th>{tp.spalten.wirkung}</th>
              <th>{tp.spalten.erklaerung}</th>
            </tr>
          </thead>
          <tbody>
            {e.zeilen.map((z) => {
              const stufe = istStufe(z.zeile);
              const zins =
                z.zeile === "zinsaufwendungen" && p.zinsbuchungen.anzahl > 0;
              const erkl = p.erklaerungen[z.zeile];
              const fehltText = [
                z.plan === null
                  ? `${tp.planQuelle}: ${nameText(z.zeile)}`
                  : null,
                z.ist === null ? `${tp.istQuelle}: ${nameText(z.zeile)}` : null,
              ].filter((x): x is string => x !== null);
              const teile = stufe
                ? STUFEN_TEILE[z.zeile as keyof typeof STUFEN_TEILE]
                : [];
              return (
                <tr
                  key={z.zeile}
                  data-zeile={z.zeile}
                  className={stufe ? "bg-slate-50 font-semibold" : undefined}
                >
                  <td>{name(z.zeile)}</td>
                  <td className={rechts}>
                    {z.plan === null ? (
                      <Unbekannt t={t} />
                    ) : stufe ? (
                      <MitHerleitung
                        wert={f.betragGanz(z.plan)}
                        herleitung={{
                          berechnung:
                            t.glossar[
                              z.zeile === "ebitda"
                                ? "EBITDA"
                                : z.zeile === "ebit"
                                  ? "EBIT"
                                  : "EBT"
                            ].lang.split(": ")[1],
                          werte: teile.map(([, k]): [string, string] => [
                            nameText(k),
                            wert(planWerte[k]),
                          ]),
                          quelle: planQuelle,
                        }}
                        t={t}
                        ausrichtung="rechts"
                      />
                    ) : (
                      f.betragGanz(z.plan)
                    )}
                  </td>
                  <td className={rechts}>
                    {z.ist === null ? (
                      <Unbekannt t={t} />
                    ) : (
                      <MitHerleitung
                        wert={f.betragGanz(z.ist)}
                        herleitung={{
                          berechnung: stufe
                            ? t.glossar[
                                z.zeile === "ebitda"
                                  ? "EBITDA"
                                  : z.zeile === "ebit"
                                    ? "EBIT"
                                    : "EBT"
                              ].lang.split(": ")[1]
                            : undefined,
                          werte: teile.map(([, k]): [string, string] => [
                            nameText(k),
                            wert(istWerte?.[k]),
                          ]),
                          quelle: istQuelle ?? undefined,
                          stichtag: p.ist ? f.datum(p.ist.ende) : undefined,
                          hinweis: zins
                            ? `${fuelle(tp.zinsHilfe, { jahr: p.jahr, summe: f.betragGanz(p.zinsbuchungen.summe), anzahl: p.zinsbuchungen.anzahl })} (${tp.zinsHilfeQuelle})`
                            : undefined,
                        }}
                        t={t}
                        ausrichtung="rechts"
                      />
                    )}
                  </td>
                  <td className={rechts}>
                    <MitHerleitung
                      wert={
                        z.betrag === null ? (
                          <Unbekannt t={t} />
                        ) : (
                          f.betragGanz(z.betrag)
                        )
                      }
                      herleitung={{
                        berechnung: tp.berechnung,
                        werte: [
                          [tp.istQuelle, wert(z.ist)],
                          [tp.planQuelle, wert(z.plan)],
                        ],
                        stichtag: p.ist ? f.datum(p.ist.ende) : undefined,
                        fehlt: fehltText,
                      }}
                      t={t}
                      ausrichtung="rechts"
                    />
                  </td>
                  <td className={rechts}>
                    {z.prozent === null ? "–" : f.prozent(z.prozent, 1)}
                  </td>
                  <td className="whitespace-nowrap">
                    {z.wirkung ? (
                      <Marke ton={WIRKUNG_TON[z.wirkung]}>
                        {tp.wirkungen[z.wirkung]}
                      </Marke>
                    ) : (
                      "–"
                    )}{" "}
                    {z.wesentlich && (
                      <Marke ton="warnung">{tp.wesentlich}</Marke>
                    )}
                  </td>
                  <td className="max-w-xs text-sm font-normal">
                    {erkl && (
                      <div>
                        <div className="whitespace-pre-line">{erkl.text}</div>
                        <div className="text-xs text-slate-500">
                          {fuelle(tp.erklaertVon, {
                            von: erkl.von ?? "–",
                            datum: f.datum(erkl.am),
                          })}
                        </div>
                      </div>
                    )}
                    {z.erklaerungFehlt && (
                      <Marke ton="warnung">{tp.erklaerungFehlt}</Marke>
                    )}
                    {zins && !erkl && (
                      <div className="text-xs text-slate-500">
                        {fuelle(tp.zinsHilfe, {
                          jahr: p.jahr,
                          summe: f.betragGanz(p.zinsbuchungen.summe),
                          anzahl: p.zinsbuchungen.anzahl,
                        })}
                      </div>
                    )}
                    {schreiben && (z.betrag !== null || erkl) && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-sky-700">
                          {erkl ? tp.erklaerungAendern : tp.erklaeren}
                        </summary>
                        <Formular
                          aktion={erklaerungSpeichern.bind(null, p.id, z.zeile)}
                          absenden={t.allgemein.speichern}
                          className="mt-2"
                        >
                          <Textfeld
                            name="text"
                            label={tp.erklaerungText}
                            wert={erkl?.text}
                          />
                          <p className="text-xs text-slate-500">
                            {tp.erklaerungHinweis}
                          </p>
                        </Formular>
                      </details>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Tabelle>
      </Karte>

      {saeulen.some((s) => s.wert || s.plan) && (
        <Karte titel={tp.diagramm}>
          <Jahressaeulen
            jahre={saeulen}
            format={(w) => f.betragGanz(w)}
            formatKurz={(w) => f.betragKurz(w)}
            legende={tp.diagrammLegende}
          />
        </Karte>
      )}

      {schreiben && (
        <Karte titel={tp.bearbeiten}>
          <details>
            <summary className="cursor-pointer text-sm text-sky-700">
              {tp.bearbeiten}
            </summary>
            <p className="mt-2 text-xs text-slate-500">
              {tp.bearbeitenHinweis}
            </p>
            <Formular
              aktion={planSpeichern.bind(null, p.id)}
              absenden={t.allgemein.speichern}
              className="mt-3 space-y-4"
            >
              <Felder>
                <Auswahl
                  name="status"
                  label={tp.status}
                  wert={p.status}
                  optionen={(["ENTWURF", "BESCHLOSSEN"] as const).map((s) => ({
                    wert: s,
                    text: tp.stati[s],
                  }))}
                  pflicht
                />
                <Feld
                  name="beschlossenAm"
                  label={tp.beschlossenAm}
                  typ="date"
                  wert={p.beschlossenAm ?? undefined}
                />
                <Feld
                  name="quelle"
                  label={tp.quelle}
                  wert={p.quelle}
                  platzhalter={tp.quellePlatzhalter}
                />
              </Felder>
              <Felder>
                {GUV_POSTEN.map((k) => (
                  <Feld
                    key={k}
                    name={k}
                    label={t.finanzen.posten[k]}
                    wert={f.eingabe(p.plan[k], 2)}
                    inputMode="decimal"
                  />
                ))}
              </Felder>
              <Felder>
                <Textfeld
                  name="notiz"
                  label={t.allgemein.notiz}
                  wert={p.notiz}
                />
              </Felder>
            </Formular>
          </details>
          <div className="mt-4">
            <Formular
              aktion={planLoeschen.bind(null, p.id)}
              absenden={tp.loeschen}
              art="gefahr"
              bestaetigen={t.allgemein.loeschenBestaetigen}
            />
          </div>
        </Karte>
      )}
      <Glossar
        begriffe={["PlanIst", "WesentlicheAbweichung", "EBITDA", "EBIT", "EBT"]}
        t={t}
      />
    </div>
  );
}
