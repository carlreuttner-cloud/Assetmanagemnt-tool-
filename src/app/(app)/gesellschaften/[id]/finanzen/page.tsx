import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Jahressaeulen, Liniendiagramm } from "@/components/diagramme";
import {
  Begriff,
  Glossar,
  Hinweismarke,
  MitHerleitung,
  Unbekannt,
  type GlossarBegriff,
} from "@/components/herleitung";
import {
  Karte,
  KnopfLink,
  Leer,
  Seitenkopf,
  Tabelle,
  rechts,
} from "@/components/ui";
import { fuelle, texte, type Texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { erlaubt, ladeRechengrundlage } from "@/lib/daten/portfolio";
import {
  ladeGeschaeftsjahre,
  type GeschaeftsjahrZeile,
} from "@/lib/daten/finanzen";
import {
  finanzVerlauf,
  kreditAbgleich,
  type JahresKennzahlen,
  type JahresSpalte,
  type Posten,
} from "@/lib/finanzen";
import { formatierer, type Formatierer } from "@/lib/format";
import type { Decimal } from "@/lib/geld";
import type { KreditDaten } from "@/lib/kredit";

type Spalte = JahresSpalte<GeschaeftsjahrZeile>;
type Zeile = {
  label: ReactNode;
  zelle: (d: GeschaeftsjahrZeile, k: JahresKennzahlen, s: Spalte) => ReactNode;
  betont?: boolean;
};

export default async function FinanzenSeite({
  params,
}: PageProps<"/gesellschaften/[id]/finanzen">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("gesellschaften");
  const t = texte(kontext.mandant.sprache);
  const f = formatierer(kontext.mandant);
  const tf = t.finanzen;
  const grundlage = await ladeRechengrundlage(kontext, { gesellschaftId: id });
  const g = await kontext.db.gesellschaft.findFirst({
    where: { id: erlaubt(grundlage.sicht.gesellschaftIds, id) },
    select: { id: true, name: true },
  });
  if (!g) notFound();
  const schreiben = darf(kontext.rolle, "gesellschaften", "schreiben");
  const verlauf = finanzVerlauf(await ladeGeschaeftsjahre(kontext, id));
  const kredite = grundlage.kredite.filter((k) => k.gesellschaftId === id);

  const quelle = (d: GeschaeftsjahrZeile) =>
    d.quelleText ?? t.abschlussQuellen[d.quelle];
  const fehlt = (
    <span className="text-xs italic text-slate-400">{tf.nichtAngegeben}</span>
  );
  const posten = (p: Posten): Zeile => ({
    label: tf.posten[p],
    zelle: (d) => (d[p] === null ? fehlt : f.betragGanz(d[p])),
  });
  const begriff = (k: GlossarBegriff, text: string) => (
    <Begriff k={k} t={t}>
      {text}
    </Begriff>
  );
  /** Berechneter Wert mit Herleitung; fehlende Posten werden genannt. */
  const berechnet = (
    label: ReactNode,
    wert: (k: JahresKennzahlen) => Decimal | null,
    formel: string,
    teile: Posten[],
    optionen: {
      text?: (w: Decimal) => string;
      hinweis?: (d: GeschaeftsjahrZeile, k: JahresKennzahlen) => ReactNode;
      zusatz?: Array<
        [string, (d: GeschaeftsjahrZeile, k: JahresKennzahlen) => string]
      >;
      betont?: boolean;
    } = {},
  ): Zeile => ({
    label,
    betont: optionen.betont,
    zelle: (d, k) => {
      const w = wert(k);
      return (
        <MitHerleitung
          wert={
            w === null ? (
              <Unbekannt t={t} />
            ) : (
              (optionen.text ?? ((x) => f.betragGanz(x)))(w)
            )
          }
          herleitung={{
            berechnung: formel,
            werte: [
              ...teile.map((p): [string, string] => [
                tf.posten[p],
                d[p] === null ? "–" : f.betragGanz(d[p]),
              ]),
              ...(optionen.zusatz ?? []).map(([n, fn]): [string, string] => [
                n,
                fn(d, k),
              ]),
            ],
            quelle: quelle(d),
            stichtag: f.datum(d.ende),
            fehlt: teile.filter((p) => d[p] === null).map((p) => tf.posten[p]),
            hinweis: optionen.hinweis?.(d, k),
          }}
          t={t}
          ausrichtung="rechts"
        />
      );
    },
  });
  const ebitdaFormel = t.glossar.EBITDA.lang.split(": ")[1];
  const guvTeile: Posten[] = [
    "umsatzerloese",
    "sonstigeErtraege",
    "materialaufwand",
    "personalaufwand",
    "sonstigeAufwendungen",
  ];

  const abschnitte: Array<{ titel: ReactNode; zeilen: Zeile[] }> = [
    {
      titel: tf.guv,
      zeilen: [
        posten("umsatzerloese"),
        posten("sonstigeErtraege"),
        posten("materialaufwand"),
        posten("personalaufwand"),
        posten("sonstigeAufwendungen"),
        berechnet(
          begriff("EBITDA", tf.ebitda),
          (k) => k.ebitda,
          ebitdaFormel,
          guvTeile,
          {
            betont: true,
            hinweis: (_d, k) =>
              k.ebitdaVeraenderung
                ? fuelle(tf.veraenderungVorjahr, {
                    betrag: f.betragGanz(k.ebitdaVeraenderung),
                  })
                : undefined,
          },
        ),
        posten("abschreibungen"),
        berechnet(
          begriff("EBIT", tf.ebit),
          (k) => k.ebit,
          t.glossar.EBIT.lang.split(": ")[1],
          [...guvTeile, "abschreibungen"],
        ),
        posten("zinsertraege"),
        posten("zinsaufwendungen"),
        berechnet(
          begriff("EBT", tf.ebt),
          (k) => k.ebt,
          t.glossar.EBT.lang.split(": ")[1],
          [...guvTeile, "abschreibungen", "zinsertraege", "zinsaufwendungen"],
        ),
        posten("steuern"),
        {
          label: tf.posten.jahresergebnis,
          betont: true,
          zelle: (d, k) =>
            d.jahresergebnis === null ? (
              fehlt
            ) : (
              <MitHerleitung
                wert={
                  <span
                    className={
                      d.jahresergebnis.isNegative() ? "text-red-700" : undefined
                    }
                  >
                    {f.betragGanz(d.jahresergebnis)}
                  </span>
                }
                herleitung={{
                  werte: [
                    [
                      tf.ergebnisRechnerisch,
                      k.jahresergebnisRechnerisch
                        ? f.betragGanz(k.jahresergebnisRechnerisch)
                        : t.allgemein.unbekannt,
                    ],
                  ],
                  quelle: quelle(d),
                  stichtag: f.datum(d.ende),
                  hinweis: k.ergebnisAbweichung
                    ? fuelle(tf.ergebnisAbweichung, {
                        betrag: f.betragGanz(k.ergebnisAbweichung),
                      })
                    : undefined,
                }}
                t={t}
                ausrichtung="rechts"
              />
            ),
        },
      ],
    },
    {
      titel: tf.bilanz,
      zeilen: [
        posten("anlagevermoegen"),
        posten("umlaufvermoegen"),
        posten("liquideMittel"),
        berechnet(
          tf.aktiva,
          (k) => k.aktiva,
          `${tf.posten.anlagevermoegen} + ${tf.posten.umlaufvermoegen} + ${tf.posten.liquideMittel}`,
          ["anlagevermoegen", "umlaufvermoegen", "liquideMittel"],
          { betont: true },
        ),
        posten("eigenkapital"),
        posten("rueckstellungen"),
        {
          label: tf.posten.verbindlichkeitenBanken,
          zelle: (d) => <BankAbgleich d={d} kredite={kredite} t={t} f={f} />,
        },
        posten("sonstigeVerbindlichkeiten"),
        berechnet(
          tf.passiva,
          (k) => k.passiva,
          `${tf.posten.eigenkapital} + ${tf.posten.rueckstellungen} + ${tf.posten.verbindlichkeitenBanken} + ${tf.posten.sonstigeVerbindlichkeiten}`,
          [
            "eigenkapital",
            "rueckstellungen",
            "verbindlichkeitenBanken",
            "sonstigeVerbindlichkeiten",
          ],
          {
            betont: true,
            hinweis: (_d, k) =>
              k.bilanzDifferenz === null
                ? undefined
                : k.bilanzDifferenz.isZero()
                  ? tf.bilanzGehtAuf
                  : fuelle(tf.bilanzDifferenz, {
                      betrag: f.betragGanz(k.bilanzDifferenz),
                    }),
          },
        ),
      ],
    },
    {
      titel: begriff("Kapitalfluss", tf.cashflow),
      zeilen: [
        posten("cashflowLaufend"),
        posten("cashflowInvestition"),
        posten("cashflowFinanzierung"),
        berechnet(
          tf.cashflowSumme,
          (k) => k.cashflowSumme,
          `${tf.posten.cashflowLaufend} + ${tf.posten.cashflowInvestition} + ${tf.posten.cashflowFinanzierung}`,
          ["cashflowLaufend", "cashflowInvestition", "cashflowFinanzierung"],
          {
            betont: true,
            hinweis: (_d, k) =>
              k.cashflowDifferenz
                ? fuelle(tf.cashflowDifferenz, {
                    betrag: f.betragGanz(k.cashflowDifferenz),
                  })
                : undefined,
          },
        ),
        berechnet(
          tf.liquiditaetsveraenderung,
          (k) => k.liquiditaetsveraenderung,
          `${tf.posten.liquideMittel} − ${tf.posten.liquideMittel} (Vorjahr)`,
          ["liquideMittel"],
          {
            hinweis: (_d, k) =>
              k.liquiditaetsveraenderung === null
                ? tf.cashflowVorjahrFehlt
                : undefined,
          },
        ),
      ],
    },
    {
      titel: tf.kennzahlen,
      zeilen: [
        berechnet(
          begriff("EBITDAMarge", tf.ebitdaMarge),
          (k) => k.ebitdaMarge,
          t.glossar.EBITDAMarge.lang,
          guvTeile,
          { text: (w) => f.prozent(w, 1) },
        ),
        berechnet(
          begriff("Eigenkapitalquote", tf.eigenkapitalquote),
          (k) => k.eigenkapitalquote,
          `${tf.posten.eigenkapital} ÷ ${tf.passiva} × 100`,
          [
            "eigenkapital",
            "rueckstellungen",
            "verbindlichkeitenBanken",
            "sonstigeVerbindlichkeiten",
          ],
          {
            text: (w) => f.prozent(w, 1),
          },
        ),
        berechnet(
          begriff("Zinsdeckung", tf.zinsdeckung),
          (k) => k.zinsdeckung,
          `${tf.ebitda} ÷ ${tf.posten.zinsaufwendungen}`,
          [...guvTeile, "zinsaufwendungen"],
          { text: (w) => f.faktor(w) },
        ),
        berechnet(
          begriff("Nettoverschuldung", tf.nettoverschuldung),
          (k) => k.nettoverschuldung,
          t.glossar.Nettoverschuldung.lang,
          ["verbindlichkeitenBanken", "liquideMittel"],
        ),
        berechnet(
          tf.nettoverschuldungZuEbitda,
          (k) => k.nettoverschuldungZuEbitda,
          `${tf.nettoverschuldung} ÷ ${tf.ebitda}`,
          ["verbindlichkeitenBanken", "liquideMittel", ...guvTeile],
          {
            text: (w) => f.faktor(w, 1),
          },
        ),
      ],
    },
  ];

  const saeulen = verlauf.map((s) => ({
    jahr: s.jahr,
    wert: s.k?.ebitda ?? null,
    entwurf: s.daten?.status === "ENTWURF",
    titel: s.daten
      ? `${t.abschlussQuellen[s.daten.quelle]} · ${t.abschlussStatus[s.daten.status]}`
      : tf.nichtErfasst,
  }));
  const reihe = (name: string, w: (s: Spalte) => Decimal | null) => ({
    name,
    punkte: verlauf.map((s) => ({ x: `${s.jahr}-12-31` as const, y: w(s) })),
  });

  return (
    <div className="space-y-6">
      <Seitenkopf
        titel={tf.titel}
        beschreibung={`${g.name} · ${tf.beschreibung}`}
        zurueck={{ href: `/gesellschaften/${id}`, text: g.name }}
        aktionen={
          <>
            <KnopfLink href={`/plan-ist?gesellschaft=${id}`}>
              {t.navigation.planIst}
            </KnopfLink>
            {schreiben && (
              <KnopfLink
                href={`/gesellschaften/${id}/finanzen/neu`}
                art="primaer"
              >
                {tf.neu}
              </KnopfLink>
            )}
          </>
        }
      />

      {verlauf.length === 0 ? (
        <Karte>
          <Leer>{tf.keine}</Leer>
        </Karte>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Karte titel={begriff("EBITDA", tf.diagrammEbitda)}>
              <Jahressaeulen
                jahre={saeulen}
                format={(w) => f.betragGanz(w)}
                formatKurz={(w) => f.betragKurz(w)}
                legende={{
                  beleg: t.abschlussStatus.ENDGUELTIG,
                  entwurf: t.abschlussStatus.ENTWURF,
                  plan: "",
                }}
              />
              <p className="mt-2 text-xs text-slate-500">
                {tf.diagrammHinweis}
              </p>
            </Karte>
            <Karte titel={tf.diagrammVerlauf}>
              <Liniendiagramm
                reihen={[
                  reihe(
                    tf.posten.umsatzerloese,
                    (s) => s.daten?.umsatzerloese ?? null,
                  ),
                  reihe(tf.ebitda, (s) => s.k?.ebitda ?? null),
                  reihe(
                    tf.posten.jahresergebnis,
                    (s) => s.daten?.jahresergebnis ?? null,
                  ),
                ]}
                formatY={(w) => f.betragKurz(w)}
                formatX={(d) => d.slice(0, 4)}
                nullLinie
              />
            </Karte>
          </div>

          <Karte>
            <Tabelle>
              <thead>
                <tr>
                  <th className="w-72" />
                  {verlauf.map((s) => (
                    <th key={s.jahr} className={`${rechts} align-top`}>
                      <div className="text-sm font-semibold normal-case text-slate-900">
                        {s.jahr}
                        {s.daten?.status === "ENTWURF" && (
                          <Hinweismarke>
                            {t.abschlussStatus.ENTWURF}
                          </Hinweismarke>
                        )}
                      </div>
                      {s.daten ? (
                        <>
                          <div className="text-xs font-normal normal-case text-slate-500">
                            {t.abschlussQuellen[s.daten.quelle]}
                          </div>
                          {schreiben && (
                            <Link
                              href={`/gesellschaften/${id}/finanzen/${s.daten.id}`}
                              className="text-xs font-normal normal-case text-slate-600 hover:underline"
                            >
                              {t.allgemein.bearbeiten}
                            </Link>
                          )}
                        </>
                      ) : (
                        <div
                          className="text-xs font-normal normal-case text-amber-700"
                          title={tf.nichtErfasstHinweis}
                        >
                          {tf.nichtErfasst}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {abschnitte.flatMap((a, ai) => [
                  <tr key={`a${ai}`} className="bg-slate-50">
                    <td
                      colSpan={verlauf.length + 1}
                      className="font-semibold text-slate-800"
                    >
                      {a.titel}
                    </td>
                  </tr>,
                  ...a.zeilen.map((z, i) => (
                    <tr
                      key={`${ai}-${i}`}
                      className={z.betont ? "font-semibold" : undefined}
                    >
                      <td
                        className={
                          z.betont ? "text-slate-900" : "text-slate-600"
                        }
                      >
                        {z.label}
                      </td>
                      {verlauf.map((s) => (
                        <td
                          key={s.jahr}
                          className={`${rechts} tabular-nums ${s.daten?.status === "ENTWURF" ? "bg-amber-50/40" : ""}`}
                        >
                          {s.daten && s.k ? (
                            z.zelle(s.daten, s.k, s)
                          ) : (
                            <span className="text-slate-300">–</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  )),
                ])}
              </tbody>
            </Tabelle>
            <p className="mt-3 text-xs text-slate-500">{tf.formular.hinweis}</p>
          </Karte>
        </>
      )}

      <Glossar
        begriffe={[
          "EBITDA",
          "EBIT",
          "EBT",
          "EBITDAMarge",
          "Eigenkapitalquote",
          "Zinsdeckung",
          "Nettoverschuldung",
          "Kapitalfluss",
          "BWA",
          "Entwurf",
        ]}
        t={t}
      />
    </div>
  );
}

/** Bankverbindlichkeiten laut Bilanz mit Abgleich gegen die belegten Kreditsalden zum Bilanzstichtag. */
function BankAbgleich({
  d,
  kredite,
  t,
  f,
}: {
  d: GeschaeftsjahrZeile;
  kredite: KreditDaten[];
  t: Texte;
  f: Formatierer;
}) {
  const tf = t.finanzen;
  if (d.verbindlichkeitenBanken === null)
    return (
      <span className="text-xs italic text-slate-400">{tf.nichtAngegeben}</span>
    );
  const a = kreditAbgleich(d, kredite);
  const abweichung = a.differenz && !a.differenz.isZero();
  return (
    <MitHerleitung
      wert={
        <span className={abweichung ? "text-amber-700" : undefined}>
          {f.betragGanz(d.verbindlichkeitenBanken)}
          {abweichung && <Hinweismarke>{tf.abweichung}</Hinweismarke>}
        </span>
      }
      herleitung={{
        berechnung: tf.abgleichKredite,
        werte: [
          [
            tf.posten.verbindlichkeitenBanken,
            f.betragGanz(d.verbindlichkeitenBanken),
          ],
          [
            fuelle(tf.abgleichSumme, { datum: f.datum(d.ende) }),
            a.summe ? f.betragGanz(a.summe) : t.allgemein.unbekannt,
          ],
        ],
        quelle: d.quelleText ?? t.abschlussQuellen[d.quelle],
        stichtag: f.datum(d.ende),
        fehlt: a.ohneSaldo.length
          ? [`${tf.abgleichOhneSaldo}: ${a.ohneSaldo.join(", ")}`]
          : undefined,
        hinweis: a.differenz
          ? a.differenz.isZero()
            ? tf.abgleichStimmt
            : fuelle(tf.abgleichDifferenz, { betrag: f.betrag(a.differenz) })
          : undefined,
      }}
      t={t}
      ausrichtung="rechts"
    />
  );
}
