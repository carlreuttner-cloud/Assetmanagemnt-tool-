/**
 * Nachvollziehbarkeit in der Ansicht: Werte mit aufklappbarer Herleitung (Berechnung, Quelle,
 * Stichtag, fehlende Angaben), „unbekannt“ statt 0 und erklärte Abkürzungen.
 * Server-Komponenten ohne JavaScript im Browser (<details>, <abbr>).
 */
import type { ReactNode } from "react";
import { fuelle, type Texte } from "@/i18n";
import type { Formatierer } from "@/lib/format";
import type { Decimal } from "@/lib/geld";
import { summeOderUnbekannt, vollstaendig, type Kennzahlen, type LueckenArt, type Vollstaendigkeit } from "@/lib/kennzahlen";
import { referenzzinsAm, zinssatz, type Kapitaldienst, type KreditDaten, type ReferenzWert, type RestschuldNachweis } from "@/lib/kredit";

export interface HerleitungDaten {
  berechnung?: ReactNode;
  /** Zwischenwerte, z. B. ["Restschuld", "1.234.567 €"] */
  werte?: Array<[ReactNode, ReactNode]>;
  quelle?: ReactNode;
  stichtag?: ReactNode;
  fehlt?: ReactNode[];
  hinweis?: ReactNode;
}

/** Wert mit aufklappbarer Herleitung. */
export function MitHerleitung({ wert, herleitung, t, ausrichtung = "links" }: { wert: ReactNode; herleitung: HerleitungDaten; t: Texte; ausrichtung?: "links" | "rechts" }) {
  const th = t.herleitung;
  const zeilen: Array<[ReactNode, ReactNode]> = [];
  if (herleitung.berechnung) zeilen.push([th.berechnung, herleitung.berechnung]);
  for (const w of herleitung.werte ?? []) zeilen.push(w);
  if (herleitung.quelle) zeilen.push([th.quelle, herleitung.quelle]);
  if (herleitung.stichtag) zeilen.push([th.stichtag, herleitung.stichtag]);
  for (const l of herleitung.fehlt ?? []) zeilen.push([th.fehlt, <span key="fehlt" className="text-amber-700">{l}</span>]);
  if (herleitung.hinweis) zeilen.push([th.hinweis, herleitung.hinweis]);
  return (
    <>
      <details className={`group relative ${ausrichtung === "rechts" ? "inline-flex flex-col items-end" : "inline-block"}`}>
        <summary className="inline-flex cursor-pointer list-none items-baseline gap-1 whitespace-nowrap [&::-webkit-details-marker]:hidden" title={th.oeffnen}>
          <span>{wert}</span>
          <span aria-hidden className="text-xs font-normal text-slate-400 group-open:text-teal-700">ⓘ</span>
          <span className="sr-only">{th.oeffnen}</span>
        </summary>
        {/* In Tabellen (rechts ausgerichtet) im Fluss, damit Tabellen mit Scrollbereich nichts abschneiden. */}
        <div
          className={`z-20 mt-1 w-72 max-w-[85vw] rounded-lg border border-slate-200 bg-white p-3 text-left text-xs font-normal normal-case tracking-normal whitespace-normal text-slate-700 shadow-lg ${
            ausrichtung === "rechts" ? "relative ml-auto" : "absolute left-0"
          }`}
        >
          <dl className="space-y-1.5">
            {zeilen.map(([k, v], i) => (
              <div key={i}>
                <dt className="font-medium text-slate-500">{k}</dt>
                <dd className="whitespace-normal">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </details>
      <QuellenZeile herleitung={herleitung} t={t} ausrichtung={ausrichtung} />
    </>
  );
}

/**
 * Stichtag und Quelle direkt unter dem Wert; sichtbar nur mit dem Schalter „Stichtage und Quellen“
 * (CSS über `[data-quellen="an"]` in globals.css, damit das Umschalten ohne Neuladen wirkt).
 */
function QuellenZeile({ herleitung, t, ausrichtung }: { herleitung: HerleitungDaten; t: Texte; ausrichtung: "links" | "rechts" }) {
  const tq = t.quellen;
  if (!herleitung.stichtag && !herleitung.quelle && !herleitung.fehlt?.length) return null;
  return (
    <span className={`quellen-info max-w-64 text-[10px] leading-tight font-normal normal-case tracking-normal whitespace-normal text-slate-500 ${ausrichtung === "rechts" ? "text-right" : "text-left"}`}>
      {herleitung.stichtag && (
        <span className="block">
          {tq.stichtag}: {herleitung.stichtag}
        </span>
      )}
      {herleitung.quelle && (
        <span className="block">
          {tq.quelle}: {herleitung.quelle}
        </span>
      )}
      {!!herleitung.fehlt?.length && <span className="block text-amber-700">{tq.luecke}: {herleitung.fehlt.length}</span>}
    </span>
  );
}

/** Anzeige für einen fehlenden Wert. */
export function Unbekannt({ t, grund }: { t: Texte; grund?: string }) {
  return (
    <span className="italic text-slate-400" title={grund ?? t.herleitung.unbekanntGrund}>
      {t.allgemein.unbekannt}
    </span>
  );
}

/** Kleine Marke für unvollständige Summen und Entwürfe. */
export function Hinweismarke({ children }: { children: ReactNode }) {
  return <span className="ml-1 rounded bg-amber-50 px-1 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide text-amber-800">{children}</span>;
}

export type GlossarBegriff = Exclude<keyof Texte["glossar"], "titel">;

/** Abkürzung mit Erklärung beim Darüberfahren oder Antippen (Tooltip). */
export function Begriff({ k, t, children }: { k: GlossarBegriff; t: Texte; children?: ReactNode }) {
  const b = t.glossar[k];
  return (
    <abbr title={b.lang} className="cursor-help decoration-dotted underline-offset-2">
      {children ?? b.kurz}
    </abbr>
  );
}

/** Erklärung der auf der Seite verwendeten Begriffe, aufklappbar am Seitenende. */
export function Glossar({ begriffe, t }: { begriffe: GlossarBegriff[]; t: Texte }) {
  return (
    <details className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
      <summary className="cursor-pointer font-medium text-slate-700">{t.glossar.titel}</summary>
      <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {begriffe.map((k) => (
          <div key={k}>
            <dt className="font-medium">{t.glossar[k].kurz}</dt>
            <dd className="text-slate-600">{t.glossar[k].lang}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Kennzahlen mit Herleitung
// ---------------------------------------------------------------------------

export type KennzahlArt =
  | "verkehrswert"
  | "kaufpreis"
  | "restschuld"
  | "eigenkapital"
  | "ltv"
  | "dscr"
  | "icr"
  | "sollMonat"
  | "sollJahr"
  | "istMonat"
  | "istJahr"
  | "erwartetLeerMonat"
  | "leerstand"
  | "kapitaldienst"
  | "zinsen"
  | "bruttoanfangsrendite"
  | "kaufpreisfaktor"
  | "mietrendite";

const GRUNDLAGEN: Record<KennzahlArt, LueckenArt[]> = {
  verkehrswert: ["verkehrswert"],
  kaufpreis: ["kaufpreis"],
  restschuld: ["restschuld"],
  eigenkapital: ["verkehrswert", "restschuld"],
  ltv: ["restschuld", "verkehrswert"],
  dscr: ["kapitaldienst"],
  icr: ["kapitaldienst"],
  sollMonat: [],
  sollJahr: [],
  istMonat: [],
  istJahr: [],
  erwartetLeerMonat: ["erwarteteMiete"],
  leerstand: [],
  kapitaldienst: ["kapitaldienst"],
  zinsen: ["kapitaldienst"],
  bruttoanfangsrendite: ["kaufpreis"],
  kaufpreisfaktor: ["kaufpreis"],
  mietrendite: ["verkehrswert"],
};

/**
 * Formatierter Wert einer Kennzahl mit Herleitung. Fehlen Grundlagen vollständig, steht
 * „unbekannt“; fehlen sie teilweise, wird die Summe als unvollständig markiert.
 */
export function Kennzahl({
  art,
  k,
  t,
  f,
  stichtag,
  ganz = false,
  ausrichtung,
}: {
  art: KennzahlArt;
  k: Kennzahlen;
  t: Texte;
  f: Formatierer;
  stichtag: string;
  /** Beträge ohne Nachkommastellen */
  ganz?: boolean;
  ausrichtung?: "links" | "rechts";
}) {
  const th = t.herleitung;
  const b = (w: Parameters<Formatierer["betrag"]>[0]) => (ganz ? f.betragGanz(w) : f.betrag(w));
  const spanne = (v: Vollstaendigkeit) =>
    v.von && v.bis ? (v.von === v.bis ? f.datum(v.von) : fuelle(th.spanne, { von: f.datum(v.von), bis: f.datum(v.bis) })) : null;
  const fehlt = (arten: LueckenArt[]) =>
    arten.filter((a) => k.luecken[a].fehlend > 0).map((a) => fuelle(th.luecken[a], { anzahl: k.luecken[a].fehlend }));
  const grundlagen = GRUNDLAGEN[art];
  const unvollstaendig = grundlagen.some((g) => !vollstaendig(k.luecken[g]));

  let wert: string | null;
  const h: HerleitungDaten = { stichtag: `${th.stichtagAnsicht}: ${f.datum(stichtag)}`, fehlt: fehlt(grundlagen) };
  const rest = summeOderUnbekannt(k.restschuld, k.luecken.restschuld);
  const vw = summeOderUnbekannt(k.verkehrswert, k.luecken.verkehrswert);
  const kdUnbekannt = k.luecken.kapitaldienst.bekannt === 0 && k.luecken.kapitaldienst.fehlend > 0;
  const geschaetzt = k.luecken.kapitaldienst.geschaetzt > 0 ? fuelle(th.geschaetzt, { anzahl: k.luecken.kapitaldienst.geschaetzt }) : undefined;
  const stichtageVw = spanne(k.luecken.verkehrswert);
  const stichtageRest = spanne(k.luecken.restschuld);

  switch (art) {
    case "verkehrswert":
      wert = vw === null ? null : b(vw);
      Object.assign(h, { berechnung: th.formeln.verkehrswert, quelle: th.quellen.verkehrswert, werte: stichtageVw ? [[th.stichtage, stichtageVw]] : [] });
      break;
    case "kaufpreis":
      wert = summeOderUnbekannt(k.kaufpreis, k.luecken.kaufpreis) === null ? null : b(k.kaufpreis);
      Object.assign(h, { berechnung: th.formeln.kaufpreis, quelle: th.quellen.kaufpreis });
      break;
    case "restschuld":
      wert = rest === null ? null : b(rest);
      Object.assign(h, {
        berechnung: th.formeln.restschuld,
        quelle: th.quellen.restschuld,
        werte: stichtageRest ? [[th.stichtage, stichtageRest]] : [],
        hinweis: k.luecken.restschuld.von !== k.luecken.restschuld.bis ? th.mehrereStichtage : undefined,
      });
      break;
    case "eigenkapital":
      wert = unvollstaendig ? null : b(k.verkehrswert.minus(k.restschuld));
      Object.assign(h, {
        berechnung: th.formeln.eigenkapital,
        werte: [
          [t.kennzahlen.verkehrswert, `${b(vw)}${stichtageVw ? ` (${stichtageVw})` : ""}`],
          [t.kennzahlen.restschuld, `${b(rest)}${stichtageRest ? ` (${stichtageRest})` : ""}`],
        ],
      });
      break;
    case "ltv":
      wert = f.prozent(k.ltv, 1);
      if (k.ltv === null) wert = null;
      Object.assign(h, {
        berechnung: th.formeln.ltv,
        werte: [
          [t.kennzahlen.restschuld, `${b(rest)}${stichtageRest ? ` (${stichtageRest})` : ""}`],
          [t.kennzahlen.verkehrswert, `${b(vw)}${stichtageVw ? ` (${stichtageVw})` : ""}`],
        ],
        quelle: `${th.quellen.restschuld}; ${th.quellen.verkehrswert}`,
      });
      break;
    case "dscr":
    case "icr":
      wert = art === "dscr" ? (k.dscr === null ? null : f.faktor(k.dscr)) : k.icr === null ? null : f.faktor(k.icr);
      Object.assign(h, {
        berechnung: art === "dscr" ? th.formeln.dscr : th.formeln.icr,
        werte: [
          [t.kennzahlen.istMieteJahr, `${f.betrag(k.istMonat)} × 12 = ${f.betrag(k.istJahr)}`],
          art === "dscr"
            ? [t.kennzahlen.kapitaldienstJahr, `${f.betrag(k.zinsenJahr)} + ${f.betrag(k.tilgungJahr)} = ${f.betrag(k.kapitaldienstJahr)}`]
            : [t.kennzahlen.zinsenJahr, f.betrag(k.zinsenJahr)],
        ],
        quelle: `${th.quellen.miete}; ${th.quellen.kapitaldienst}`,
        hinweis: [t.kennzahlen.hinweisDscr, geschaetzt].filter(Boolean).join(" "),
      });
      break;
    case "sollMonat":
    case "sollJahr":
    case "istMonat":
    case "istJahr": {
      const soll = art.startsWith("soll");
      const monat = soll ? k.sollMonat : k.istMonat;
      wert = art.endsWith("Monat") ? f.betrag(monat) : f.betrag(soll ? k.sollJahr : k.istJahr);
      Object.assign(h, {
        berechnung: soll ? th.formeln.sollMonat : th.formeln.istMonat,
        werte: [[th.ergebnis, `${f.betrag(monat)} × 12 = ${f.betrag(soll ? k.sollJahr : k.istJahr)}`]],
        quelle: th.quellen.miete,
      });
      break;
    }
    case "erwartetLeerMonat":
      wert = summeOderUnbekannt(k.erwartetLeerMonat, k.luecken.erwarteteMiete) === null ? null : f.betrag(k.erwartetLeerMonat);
      Object.assign(h, {
        berechnung: th.formeln.erwartetLeer,
        werte: [[th.ergebnis, `${f.betrag(k.erwartetLeerMonat)} × 12 = ${f.betrag(k.erwartetLeerJahr)}`]],
        quelle: th.quellen.erwarteteMiete,
      });
      break;
    case "leerstand":
      wert = k.leerstandQuote === null ? null : f.prozent(k.leerstandQuote, 1);
      Object.assign(h, {
        berechnung: th.formeln.leerstand,
        werte: [
          [th.leereFlaeche, f.flaeche(k.leerFlaeche)],
          [th.gesamtFlaeche, f.flaeche(k.flaeche)],
          [th.leereEinheiten, `${k.leereEinheiten} / ${k.einheiten}`],
        ],
        quelle: th.quellen.flaeche,
      });
      break;
    case "kapitaldienst":
    case "zinsen":
      wert = kdUnbekannt ? null : b(art === "zinsen" ? k.zinsenJahr : k.kapitaldienstJahr);
      Object.assign(h, {
        berechnung: th.formeln.kapitaldienst,
        werte: [
          [t.kennzahlen.zinsenJahr, f.betrag(k.zinsenJahr)],
          [t.kennzahlen.tilgungJahr, f.betrag(k.tilgungJahr)],
        ],
        quelle: th.quellen.kapitaldienst,
        hinweis: geschaetzt,
      });
      break;
    case "bruttoanfangsrendite":
    case "kaufpreisfaktor":
      wert = art === "kaufpreisfaktor" ? (k.kaufpreisfaktor === null ? null : f.faktor(k.kaufpreisfaktor, 1)) : k.bruttoanfangsrendite === null ? null : f.prozent(k.bruttoanfangsrendite);
      Object.assign(h, {
        berechnung: art === "kaufpreisfaktor" ? th.formeln.kaufpreisfaktor : th.formeln.bruttoanfangsrendite,
        werte: [
          [t.kennzahlen.sollMieteJahr, f.betrag(k.sollJahr)],
          [t.kennzahlen.kaufpreis, f.betrag(k.kaufpreis)],
        ],
        quelle: `${th.quellen.miete}; ${th.quellen.kaufpreis}`,
      });
      break;
    case "mietrendite":
      wert = k.mietrendite === null ? null : f.prozent(k.mietrendite);
      Object.assign(h, {
        berechnung: th.formeln.mietrendite,
        werte: [
          [t.kennzahlen.sollMieteJahr, f.betrag(k.sollJahr)],
          [t.kennzahlen.verkehrswert, `${b(vw)}${stichtageVw ? ` (${stichtageVw})` : ""}`],
        ],
        quelle: `${th.quellen.miete}; ${th.quellen.verkehrswert}`,
      });
      break;
  }

  const anzeige =
    wert === null ? (
      <Unbekannt t={t} />
    ) : (
      <>
        {wert}
        {unvollstaendig && <Hinweismarke>{t.allgemein.unvollstaendig}</Hinweismarke>}
      </>
    );
  return <MitHerleitung wert={anzeige} herleitung={h} t={t} ausrichtung={ausrichtung} />;
}

// ---------------------------------------------------------------------------
// Einzelne Kredite
// ---------------------------------------------------------------------------

/** Restschuld eines Kredits mit Beleg, Stichtag und Quelle; ohne Beleg „unbekannt“. */
export function RestschuldWert({
  nachweis,
  t,
  f,
  anteilProzent,
  ganz = false,
  ausrichtung = "rechts",
}: {
  nachweis: RestschuldNachweis | null;
  t: Texte;
  f: Formatierer;
  /** Anteil eines Hauses an der Schuld in Prozent */
  anteilProzent?: Decimal;
  ganz?: boolean;
  ausrichtung?: "links" | "rechts";
}) {
  const th = t.herleitung;
  const b = (w: Decimal) => (ganz ? f.betragGanz(w) : f.betrag(w));
  if (!nachweis) {
    return <MitHerleitung wert={<Unbekannt t={t} />} herleitung={{ berechnung: th.restschuldUnbekannt }} t={t} ausrichtung={ausrichtung} />;
  }
  const betrag = anteilProzent ? nachweis.betrag.times(anteilProzent).dividedBy(100) : nachweis.betrag;
  const beleg =
    nachweis.herkunft === "nichtAusgezahlt"
      ? th.restschuldNichtAusgezahlt
      : fuelle(nachweis.herkunft === "saldo" ? th.restschuldSaldo : th.restschuldBuchung, { datum: f.datum(nachweis.stichtag) });
  const werte: Array<[ReactNode, ReactNode]> = [];
  if (anteilProzent) werte.push([t.kredite.anteil, `${f.betrag(nachweis.betrag)} × ${f.prozent(anteilProzent, 2)} = ${f.betrag(betrag)}`]);
  return (
    <span className="inline-flex flex-col items-end">
      <MitHerleitung
        wert={b(betrag)}
        herleitung={{
          berechnung: beleg,
          werte,
          quelle: [nachweis.quelle ? t.saldoQuellen[nachweis.quelle] : null, nachweis.quelleText].filter(Boolean).join(": ") || undefined,
          stichtag: f.datum(nachweis.stichtag),
        }}
        t={t}
        ausrichtung={ausrichtung}
      />
      {nachweis.herkunft !== "nichtAusgezahlt" && (
        <span className="text-xs font-normal text-slate-500">
          {t.allgemein.stand} {f.datum(nachweis.stichtag)}
        </span>
      )}
    </span>
  );
}

/** Kapitaldienst eines Kredits (12 Monate) mit Herleitung. */
export function KapitaldienstWert({ kd, t, f, ausrichtung = "rechts" }: { kd: Kapitaldienst | null; t: Texte; f: Formatierer; ausrichtung?: "links" | "rechts" }) {
  const th = t.herleitung;
  if (!kd) return <MitHerleitung wert={<Unbekannt t={t} />} herleitung={{ berechnung: th.kapitaldienstUnbekannt }} t={t} ausrichtung={ausrichtung} />;
  const berechnung =
    kd.quelle === "buchungen"
      ? fuelle(th.kapitaldienstBuchungen, { von: f.datum(kd.von ?? null), bis: f.datum(kd.bis ?? null) })
      : fuelle(th.kapitaldienstSchaetzung, { saldo: f.betrag(kd.saldo ?? null), satz: f.prozent(kd.zinssatz ?? null, 3) });
  return (
    <span className="inline-flex flex-col items-end">
      <MitHerleitung
        wert={f.betrag(kd.summe)}
        herleitung={{
          berechnung,
          werte: [
            [t.kredite.zins, f.betrag(kd.zins)],
            [t.kredite.tilgung, f.betrag(kd.tilgung)],
          ],
          quelle: th.quellen.kapitaldienst,
        }}
        t={t}
        ausrichtung={ausrichtung}
      />
      {kd.quelle === "schaetzung" && <span className="text-xs font-normal text-slate-500">{t.kredite.schaetzung}</span>}
    </span>
  );
}

/** Aktueller Zinssatz mit Herleitung (Festzins bzw. Referenzzins + Marge). */
export function ZinssatzWert({
  k,
  referenzwerte,
  stichtag,
  t,
  f,
  ausrichtung = "rechts",
}: {
  k: KreditDaten;
  referenzwerte: ReferenzWert[];
  stichtag: string;
  t: Texte;
  f: Formatierer;
  ausrichtung?: "links" | "rechts";
}) {
  const th = t.herleitung;
  const satz = zinssatz(k, referenzwerte, stichtag);
  const ref = k.referenzzins ? referenzzinsAm(referenzwerte, k.referenzzins, stichtag) : null;
  const berechnung =
    k.zinsArt === "FEST"
      ? th.zinssatzFest
      : ref
        ? fuelle(th.zinssatzVariabel, { referenz: ref.referenz, datum: f.datum(ref.stichtag), satz: f.prozent(ref.satz, 3), marge: f.prozent(k.marge, 3) })
        : th.zinssatzUnbekannt;
  return (
    <MitHerleitung
      wert={satz === null ? <Unbekannt t={t} /> : f.prozent(satz, 3)}
      herleitung={{ berechnung, stichtag: ref ? f.datum(ref.stichtag) : undefined }}
      t={t}
      ausrichtung={ausrichtung}
    />
  );
}
