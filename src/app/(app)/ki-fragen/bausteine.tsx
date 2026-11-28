/**
 * Darstellung der Antwort-Bausteine mit unseren eigenen Komponenten. Alle Werte stammen aus den
 * gespeicherten Ergebnissen der Datenabfragen (vom Code berechnet); die KI liefert nur Auswahl,
 * Titel und Text mit Platzhaltern.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { Balkendiagramm, Liniendiagramm } from "@/components/diagramme";
import { Begriff, Glossar, Hinweismarke, MitHerleitung, Unbekannt, type GlossarBegriff } from "@/components/herleitung";
import { LeerstandKreis } from "@/components/nutzungsart";
import { Kachel, Kacheln, Karte, Tabelle, rechts } from "@/components/ui";
import { fuelle, type Texte } from "@/i18n";
import { formatMonat } from "@/lib/datum";
import { DIAGRAMM_FARBEN } from "@/lib/farben";
import type { Formatierer } from "@/lib/format";
import { dezimal } from "@/lib/geld";
import type { ArtSummen } from "@/lib/kennzahlen";
import {
  FELD_BEGRIFFE,
  FELDER,
  formatWert,
  sortiereZeilen,
  wertZu,
  zerlegeText,
  type AbfrageErgebnis,
  type Feld,
  type FrageDaten,
  type GeprueftBaustein,
  type GepruefteAntwort,
  type Wert,
} from "@/lib/ki-antwort";
import { NUTZUNGSARTEN, type Nutzungsart } from "@/lib/nutzungsart";
import { Regler, type ReglerTexte } from "./regler";

type Umgebung = { daten: FrageDaten; t: Texte; f: Formatierer };

/** Feldname, bei Abkürzungen mit Erklärung. */
function FeldName({ feld, t }: { feld: Feld; t: Texte }) {
  const name = t.kiFragen.felder[feld].name;
  const b = FELD_BEGRIFFE[feld];
  return b && ["JNKM", "LTV", "DSCR", "ICR"].includes(b) ? <Begriff k={b as GlossarBegriff} t={t}>{name}</Begriff> : <>{name}</>;
}

/** Wert ohne Herleitung (Tabellen, Text); unbekannt statt 0. */
function WertText({ feld, wert, u }: { feld: Feld; wert: Wert | undefined; u: Umgebung }) {
  const s = formatWert(feld, wert, u.f);
  if (s === null) return <Unbekannt t={u.t} />;
  return (
    <>
      {s}
      {wert?.unvollstaendig && <Hinweismarke>{u.t.allgemein.unvollstaendig}</Hinweismarke>}
    </>
  );
}

function herleitungZu(feld: Feld, wert: Wert | undefined, e: AbfrageErgebnis, u: Umgebung) {
  const tf = u.t.kiFragen;
  const fd = tf.felder[feld];
  return {
    berechnung: fd.formel,
    quelle: fd.quelle,
    stichtag: u.f.datum(wert?.stichtag ?? e.stichtag),
    werte: [[tf.daten, fuelle(tf.datenZeile, { id: e.id, objekt: e.objektName, datum: u.f.datum(e.stichtag) })]] as Array<[ReactNode, ReactNode]>,
    hinweis: wert?.unvollstaendig ? tf.unvollstaendigHinweis : wert?.hinweis === "schaetzung" ? tf.schaetzung : undefined,
  };
}

/** Aufklappbare Legende unter Tabellen und Diagrammen: je Feld Einheit, Quelle, Berechnung. */
function FeldLegende({ felder, e, u }: { felder: Feld[]; e: AbfrageErgebnis; u: Umgebung }) {
  const tf = u.t.kiFragen;
  return (
    <details className="mt-3 text-xs text-slate-600">
      <summary className="cursor-pointer text-slate-500">
        {u.t.herleitung.oeffnen} · {fuelle(tf.datenZeile, { id: e.id, objekt: e.objektName, datum: u.f.datum(e.stichtag) })}
      </summary>
      <dl className="mt-2 space-y-1.5">
        {felder.map((x) => (
          <div key={x}>
            <dt className="font-medium text-slate-700">
              {tf.felder[x].name}
              {tf.felder[x].einheit && ` (${tf.felder[x].einheit})`}
            </dt>
            <dd>
              {u.t.herleitung.berechnung}: {tf.felder[x].formel}. {u.t.herleitung.quelle}: {tf.felder[x].quelle}.
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function HinweisZeilen({ hinweise }: { hinweise: string[] }) {
  if (!hinweise.length) return null;
  return (
    <ul className="mt-2 space-y-0.5 text-xs text-amber-800">
      {hinweise.map((h) => (
        <li key={h}>⚠ {h}</li>
      ))}
    </ul>
  );
}

function TextBaustein({ text, u }: { text: string; u: Umgebung }) {
  const { teile } = zerlegeText(text, u.daten);
  const tf = u.t.kiFragen;
  return (
    <div className="space-y-2 text-sm leading-relaxed text-slate-800">
      {teile.map((teil, i) => {
        if ("text" in teil)
          return teil.text.split("\n").map((z, j, alle) => (
            <span key={`${i}-${j}`}>
              {z.includes("[?]") ? z.split("[?]").map((s, k, a) => (
                <span key={k}>
                  {s}
                  {k < a.length - 1 && <span className="rounded bg-amber-100 px-1 text-amber-900" title={tf.hinweisZahl}>[?]</span>}
                </span>
              )) : z}
              {j < alle.length - 1 && <br />}
            </span>
          ));
        const w = wertZu(u.daten, teil.abfrage, teil.zeile, teil.feld);
        const e = u.daten.ergebnisse.find((x) => x.id === teil.abfrage)!;
        const s = formatWert(teil.feld, w, u.f);
        const titel = `${tf.felder[teil.feld].name} · ${u.t.herleitung.quelle}: ${tf.felder[teil.feld].quelle} · ${fuelle(tf.stand, { datum: u.f.datum(w?.stichtag ?? e.stichtag) })}`;
        return (
          <span key={i} title={titel} className="font-medium tabular-nums underline decoration-slate-300 decoration-dotted underline-offset-2" data-platzhalter>
            {s ?? <Unbekannt t={u.t} />}
            {w?.unvollstaendig && <Hinweismarke>{u.t.allgemein.unvollstaendig}</Hinweismarke>}
          </span>
        );
      })}
    </div>
  );
}

function artSummen(e: Extract<AbfrageErgebnis, { typ: "werte" }>): Record<Nutzungsart, ArtSummen> {
  const n = dezimal(0);
  return Object.fromEntries(
    NUTZUNGSARTEN.map((a) => {
      const x = e.nachArt[a];
      return [a, { einheiten: x.einheiten, leereEinheiten: x.leereEinheiten, flaeche: dezimal(x.flaeche), leerFlaeche: dezimal(x.leerFlaeche), sollMonat: n, istMonat: n, erwartetLeerMonat: n }];
    }),
  ) as Record<Nutzungsart, ArtSummen>;
}

function Baustein({ b, u, reglerTexte, waehrung }: { b: GeprueftBaustein; u: Umgebung; reglerTexte: ReglerTexte; waehrung: string }) {
  const { t, f, daten } = u;
  const tf = t.kiFragen;
  if (b.typ === "TEXT") {
    return (
      <Karte titel={b.titel ?? undefined}>
        <TextBaustein text={b.text} u={u} />
        <HinweisZeilen hinweise={b.hinweise} />
      </Karte>
    );
  }
  if (b.typ === "REGLER") {
    const name =
      b.objekt === "ALLE" ? tf.alleObjekte : daten.objekte.gesellschaften.find((g) => g.code === b.objekt)?.name ?? daten.objekte.haeuser.find((h) => h.code === b.objekt)?.name ?? b.objekt;
    return (
      <Karte titel={b.titel}>
        <Regler objekt={b.objekt} objektName={b.objekt === "ALLE" ? name : `${b.objekt} ${name}`} regler={b.regler} texte={reglerTexte} sprache={f.sprache} waehrung={waehrung} />
        <HinweisZeilen hinweise={b.hinweise} />
      </Karte>
    );
  }
  const e = daten.ergebnisse.find((x) => x.id === b.abfrage)!;

  if (b.typ === "KACHELN" && e.typ === "werte") {
    return (
      <div data-baustein="KACHELN">
        {b.titel && <h3 className="mb-2 text-sm font-semibold text-slate-700">{b.titel}</h3>}
        <Kacheln>
          {b.felder.map((x) => {
            const w = e.werte[x];
            const s = formatWert(x, w, f);
            return (
              <Kachel
                key={x}
                titel={<FeldName feld={x} t={t} />}
                wert={
                  <MitHerleitung
                    wert={
                      s === null ? (
                        <Unbekannt t={t} />
                      ) : (
                        <>
                          {s}
                          {w?.unvollstaendig && <Hinweismarke>{t.allgemein.unvollstaendig}</Hinweismarke>}
                        </>
                      )
                    }
                    herleitung={herleitungZu(x, w, e, u)}
                    t={t}
                  />
                }
                unter={tf.felder[x].einheit}
              />
            );
          })}
        </Kacheln>
        <HinweisZeilen hinweise={b.hinweise} />
      </div>
    );
  }
  if (b.typ === "KREIS" && e.typ === "werte") {
    return (
      <Karte titel={b.titel}>
        <div data-baustein="KREIS">
          <LeerstandKreis nachArt={artSummen(e)} t={t} f={f} groesse={96} legende />
        </div>
        <p className="mt-2 text-xs text-slate-500">{fuelle(tf.datenZeile, { id: e.id, objekt: e.objektName, datum: f.datum(e.stichtag) })}</p>
        <HinweisZeilen hinweise={b.hinweise} />
      </Karte>
    );
  }
  if (b.typ === "TABELLE" && e.typ === "tabelle") {
    const zeilen = sortiereZeilen(e.zeilen, b.sortierFeld, b.absteigend, b.zeilen);
    return (
      <Karte titel={b.titel}>
        {zeilen.length === 0 ? (
          <p className="text-sm text-slate-500">{tf.keineZeilen}</p>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{tf.objektSpalte}</th>
                {b.felder.map((x) => (
                  <th key={x} className={FELDER[x] === "text" || FELDER[x] === "datum" ? undefined : rechts}>
                    <FeldName feld={x} t={t} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {zeilen.map((z) => (
                <tr key={z.code} className="hover:bg-slate-50">
                  <td>
                    <span className="mr-1.5 text-xs text-slate-400">{z.code}</span>
                    <Link href={z.href} className="font-medium hover:underline">
                      {z.name}
                    </Link>
                  </td>
                  {b.felder.map((x) => {
                    const w = z.werte[x];
                    return (
                      <td key={x} className={FELDER[x] === "text" || FELDER[x] === "datum" ? undefined : rechts}>
                        <WertText feld={x} wert={w} u={u} />
                        {w?.stichtag && w.stichtag !== e.stichtag && w.w !== null && <div className="text-[10px] text-slate-500">{fuelle(tf.stand, { datum: f.datum(w.stichtag) })}</div>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </Tabelle>
        )}
        <FeldLegende felder={b.felder} e={e} u={u} />
        <HinweisZeilen hinweise={b.hinweise} />
      </Karte>
    );
  }
  if (b.typ === "SAEULEN" && e.typ === "tabelle") {
    const alle = sortiereZeilen(e.zeilen, b.feld, b.absteigend, "alle");
    const bekannt = alle.filter((z) => z.werte[b.feld]?.w != null);
    const gezeigt = b.zeilen === "top5" ? bekannt.slice(0, 5) : b.zeilen === "top10" ? bekannt.slice(0, 10) : bekannt;
    const unbekannt = alle.filter((z) => z.werte[b.feld]?.w == null);
    return (
      <Karte titel={b.titel}>
        <div data-baustein="SAEULEN">
          <Balkendiagramm
            balken={gezeigt.map((z) => ({ name: `${z.code} ${z.name}`, wert: dezimal(z.werte[b.feld]!.w!), farbe: DIAGRAMM_FARBEN[0], zusatz: z.werte[b.feld]?.unvollstaendig ? t.allgemein.unvollstaendig : undefined }))}
            format={(w) => formatWert(b.feld, { w: w.toString() }, f) ?? ""}
          />
        </div>
        {unbekannt.length > 0 && (
          <p className="mt-2 text-xs text-amber-800">
            {t.allgemein.unbekannt}: {unbekannt.map((z) => `${z.code} ${z.name}`).join(", ")}
          </p>
        )}
        <FeldLegende felder={[b.feld]} e={e} u={u} />
        <HinweisZeilen hinweise={b.hinweise} />
      </Karte>
    );
  }
  if (b.typ === "LINIE" && e.typ === "reihe") {
    const reihen = b.felder.map((x) => ({ name: tf.felder[x].name, punkte: e.punkte.map((p) => ({ x: p.x, y: p.werte[x]?.w == null ? null : dezimal(p.werte[x]!.w!) })) }));
    const hatWerte = reihen.some((r) => r.punkte.some((p) => p.y !== null));
    return (
      <Karte titel={b.titel}>
        <div data-baustein="LINIE">
          {hatWerte ? (
            <Liniendiagramm reihen={reihen} formatY={(w) => f.betragKurz(w)} formatX={(d) => (d.endsWith("-12-31") ? d.slice(0, 4) : formatMonat(d))} ab0 />
          ) : (
            <p className="text-sm text-slate-500">{tf.linieUnbekannt}</p>
          )}
        </div>
        <FeldLegende felder={b.felder} e={e} u={u} />
        <HinweisZeilen hinweise={b.hinweise} />
      </Karte>
    );
  }
  return null;
}

/** Ganze Antwort: Bausteine in Reihenfolge, verworfene Bausteine, Glossar. */
export function AntwortAnsicht({ antwort, daten, t, f, waehrung }: { antwort: GepruefteAntwort; daten: FrageDaten; t: Texte; f: Formatierer; waehrung: string }) {
  const u = { daten, t, f };
  const tr = t.kiFragen.regler;
  const reglerTexte: ReglerTexte = { ...tr, glossarDscr: t.glossar.DSCR.lang, unbekannt: t.allgemein.unbekannt };
  const begriffe = new Set<GlossarBegriff>();
  for (const b of antwort.bausteine) {
    const felder = "felder" in b ? b.felder : "feld" in b ? [b.feld] : [];
    for (const x of felder) {
      const k = FELD_BEGRIFFE[x];
      if (k) begriffe.add(k as GlossarBegriff);
    }
    if (b.typ === "REGLER") begriffe.add("DSCR");
    if (b.typ === "TEXT") for (const k of ["JNKM", "LTV", "DSCR", "ICR"] as const) if (b.text.includes(k) || b.text.includes(`.${k.toLowerCase()}`)) begriffe.add(k);
  }
  return (
    <div className="space-y-6">
      {antwort.bausteine.map((b, i) => (
        <Baustein key={i} b={b} u={u} reglerTexte={reglerTexte} waehrung={waehrung} />
      ))}
      {antwort.verworfen.length > 0 && (
        <details className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <summary className="cursor-pointer font-medium">
            {t.kiFragen.verworfen} ({antwort.verworfen.length})
          </summary>
          <ul className="mt-2 list-disc pl-5">
            {antwort.verworfen.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ul>
        </details>
      )}
      {begriffe.size > 0 && <Glossar begriffe={[...begriffe]} t={t} />}
    </div>
  );
}
