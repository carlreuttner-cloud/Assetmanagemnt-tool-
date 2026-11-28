/**
 * Darstellung der Nutzungsarten (Wohnen, Gewerbe, Stellplätze): Marke mit Farbpunkt und das
 * kleine Leerstand-Kreisdiagramm. Farben nur aus src/lib/farben.ts, Texte aus src/i18n.
 */
import type { ReactNode } from "react";
import { fuelle, type Texte } from "@/i18n";
import { NEUTRAL_FARBE } from "@/lib/farben";
import type { Formatierer } from "@/lib/format";
import type { ArtSummen } from "@/lib/kennzahlen";
import { inFlaeche, NUTZUNGSART_FARBE, NUTZUNGSART_HINTERGRUND, NUTZUNGSARTEN, type Nutzungsart } from "@/lib/nutzungsart";

/** Farbpunkt in der Farbe der Nutzungsart. */
export function NutzungsartPunkt({ art, gross = false }: { art: Nutzungsart; gross?: boolean }) {
  return <span aria-hidden className={`inline-block shrink-0 rounded-full ${gross ? "h-3 w-3" : "h-2 w-2"}`} style={{ background: NUTZUNGSART_FARBE[art] }} />;
}

/** Kleine Marke „● Gewerbe“ in der Farbe der Nutzungsart. `mehrzahl` nimmt den Gruppennamen (Wohnen statt Wohnung). */
export function NutzungsartMarke({ art, t, mehrzahl = false }: { art: Nutzungsart; t: Texte; mehrzahl?: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: NUTZUNGSART_HINTERGRUND[art], color: NUTZUNGSART_FARBE[art] }}
    >
      <NutzungsartPunkt art={art} />
      <span className="text-slate-700">{mehrzahl ? t.nutzungsarten[art] : t.einheitArten[art]}</span>
    </span>
  );
}

/** Text zum Leerstand einer Nutzungsart: „3 von 40 leer (180 m² von 2.500 m²)“ bzw. Stück. */
export function leerText(art: Nutzungsart, a: ArtSummen, t: Texte, f: Formatierer): string {
  const menge = inFlaeche(art)
    ? fuelle(t.nutzung.leerFlaecheMenge, { leer: f.flaeche(a.leerFlaeche), gesamt: f.flaeche(a.flaeche) })
    : fuelle(t.nutzung.leerStueckMenge, { leer: a.leereEinheiten, gesamt: a.einheiten });
  return fuelle(t.nutzung.kreisEintrag, { art: t.nutzungsarten[art], leer: a.leereEinheiten, gesamt: a.einheiten, menge });
}

/** Kurzer Legendentext: „Wohnen: 43 leer · 2.520 m²“ bzw. „Stellplätze: 10 von 217 Stück leer“. */
function kurzText(art: Nutzungsart, a: ArtSummen, t: Texte, f: Formatierer): string {
  if (!inFlaeche(art)) return fuelle(t.nutzung.kreisKurzStueck, { art: t.nutzungsarten[art], leer: a.leereEinheiten, gesamt: a.einheiten });
  return fuelle(t.nutzung.kreisKurz, { art: t.nutzungsarten[art], leer: a.leereEinheiten, menge: `${f.zahl(a.leerFlaeche, 0)} m²` });
}

function bogen(cx: number, cy: number, r: number, von: number, bis: number) {
  const p = (w: number) => [cx + r * Math.sin(2 * Math.PI * w), cy - r * Math.cos(2 * Math.PI * w)];
  const [x1, y1] = p(von);
  const [x2, y2] = p(bis);
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${bis - von > 0.5 ? 1 : 0} 1 ${x2} ${y2} Z`;
}

/**
 * Kleines Kreisdiagramm: leere Einheiten je Nutzungsart (Anzahl). Jedes Segment hat einen
 * Tooltip mit Anzahl und Fläche bzw. Stück; ohne Leerstand ein grauer Kreis.
 */
export function LeerstandKreis({
  nachArt,
  t,
  f,
  groesse = 44,
  legende = false,
}: {
  nachArt: Record<Nutzungsart, ArtSummen>;
  t: Texte;
  f: Formatierer;
  groesse?: number;
  legende?: boolean;
}) {
  const arten = NUTZUNGSARTEN.filter((a) => nachArt[a].einheiten > 0);
  const summe = arten.reduce((s, a) => s + nachArt[a].leereEinheiten, 0);
  const titel = [t.nutzung.kreisTitel, ...arten.map((a) => leerText(a, nachArt[a], t, f))].join("\n");
  const r = groesse / 2;
  let lauf = 0;
  const segmente: ReactNode[] = [];
  for (const a of arten) {
    const n = nachArt[a].leereEinheiten;
    if (n === 0) continue;
    const anteil = n / summe;
    const inhalt = <title>{leerText(a, nachArt[a], t, f)}</title>;
    segmente.push(
      anteil >= 0.9999 ? (
        <circle key={a} cx={r} cy={r} r={r - 0.5} fill={NUTZUNGSART_FARBE[a]}>
          {inhalt}
        </circle>
      ) : (
        <path key={a} d={bogen(r, r, r - 0.5, lauf, lauf + anteil)} fill={NUTZUNGSART_FARBE[a]} stroke="#fff" strokeWidth="0.75">
          {inhalt}
        </path>
      ),
    );
    lauf += anteil;
  }
  const kreis = (
    <svg width={groesse} height={groesse} viewBox={`0 0 ${groesse} ${groesse}`} role="img" aria-label={titel} className="shrink-0" data-leerstand-kreis>
      <title>{summe === 0 ? `${t.nutzung.kreisTitel}: ${t.nutzung.kreisLeer}` : titel}</title>
      {summe === 0 ? <circle cx={r} cy={r} r={r - 0.5} fill="none" stroke={NEUTRAL_FARBE} strokeWidth="1.5" /> : segmente}
    </svg>
  );
  if (!legende) return kreis;
  return (
    <div className="flex items-center gap-3">
      {kreis}
      <ul className="space-y-0.5 text-xs text-slate-600">
        {arten.map((a) => (
          <li key={a} className="flex items-center gap-1.5 whitespace-nowrap" title={leerText(a, nachArt[a], t, f)}>
            <NutzungsartPunkt art={a} />
            {kurzText(a, nachArt[a], t, f)}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Tabellenzelle Leerstand: Quote (nach Fläche) und ein Mini-Kreis je Nutzungsart. */
export function LeerstandZelle({ quote, nachArt, t, f }: { quote: string; nachArt: Record<Nutzungsart, ArtSummen>; t: Texte; f: Formatierer }) {
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span>{quote}</span>
      <LeerstandKreis nachArt={nachArt} t={t} f={f} groesse={18} />
    </span>
  );
}

/** Flächen je Nutzungsart als kurze Zeilen: „Wohnen 2.500 m²“, „Gewerbe 320 m²“, „Stellplätze 12 Stück“. */
export function FlaechenJeArt({ nachArt, t, f, waagerecht = false }: { nachArt: Record<Nutzungsart, ArtSummen>; t: Texte; f: Formatierer; waagerecht?: boolean }) {
  const arten = NUTZUNGSARTEN.filter((a) => nachArt[a].einheiten > 0);
  return (
    <span className={waagerecht ? "inline-flex flex-wrap gap-x-3 gap-y-0.5" : "inline-flex flex-col items-end gap-0.5"}>
      {arten.map((a) => (
        <span key={a} className="inline-flex items-center gap-1.5 whitespace-nowrap" title={t.nutzungsarten[a]}>
          <NutzungsartPunkt art={a} />
          {waagerecht && `${t.nutzungsarten[a]} `}
          {inFlaeche(a) ? f.flaeche(nachArt[a].flaeche) : `${nachArt[a].einheiten} ${t.nutzung.stueck}`}
        </span>
      ))}
    </span>
  );
}
