import type { ReactNode } from "react";
import { fuelle, type Texte } from "@/i18n";
import type { CovenantPuffer, SperrenStatus } from "@/lib/covenant";
import type { Formatierer } from "@/lib/format";
import type { Kennzahlen } from "@/lib/kennzahlen";
import type { ZinsbindungStufe } from "@/lib/kredit";
import { MitHerleitung, Unbekannt } from "./herleitung";
import { Marke, type Ton } from "./ui";

const TON: Record<ZinsbindungStufe, Ton> = {
  abgelaufen: "schlecht",
  unter12: "schlecht",
  unter24: "warnung",
  spaeter: "neutral",
  keine: "neutral",
};

export function ZinsbindungMarke({
  zb,
  t,
  f,
}: {
  zb: { bis: string | null; stufe: ZinsbindungStufe; monate: number | null };
  t: Texte;
  f: Formatierer;
}) {
  const text = fuelle(t.kredite.zinsbindungStufen[zb.stufe], { monate: zb.monate ?? "", datum: f.datum(zb.bis) });
  return (
    <span title={zb.bis ? f.datum(zb.bis) : undefined}>
      <Marke ton={TON[zb.stufe]}>{text}</Marke>
    </span>
  );
}

export function CovenantMarke({ eingehalten, t }: { eingehalten: boolean | null; t: Texte }) {
  if (eingehalten === null) return <Marke>{t.kredite.nichtPruefbar}</Marke>;
  return eingehalten ? <Marke ton="gut">{t.kredite.eingehalten}</Marke> : <Marke ton="schlecht">{t.kredite.verletzt}</Marke>;
}

export function SperrenMarke({ status, t }: { status: SperrenStatus; t: Texte }) {
  if (status === "manuell") return <Marke ton="warnung">{t.kredite.sperreManuell}</Marke>;
  return status === "aktiv" ? <Marke ton="schlecht">{t.kredite.sperreAktiv}</Marke> : <Marke ton="gut">{t.kredite.sperreFrei}</Marke>;
}

/** Puffer bis zur Grenze mit Herleitung (Abstand, Spielraum der Grundlagen). */
export function PufferWert({
  puffer,
  kennzahl,
  kz,
  stichtag,
  t,
  f,
}: {
  puffer: CovenantPuffer | null;
  kennzahl: string;
  kz: Kennzahlen;
  stichtag: string;
  t: Texte;
  f: Formatierer;
}) {
  const tc = t.kredite;
  if (!puffer) return <MitHerleitung wert={<Unbekannt t={t} />} herleitung={{ berechnung: tc.pufferUnbekannt }} t={t} ausrichtung="rechts" />;
  const ltv = kennzahl.trim().toUpperCase() === "LTV";
  const abstand = ltv ? `${f.zahl(puffer.abstand, 1)} ${tc.prozentpunkte}` : f.faktor(puffer.abstand);
  const relativ = puffer.abstandRelativ ? ` (${f.prozent(puffer.abstandRelativ, 1)})` : "";
  const wert = (
    <span className={puffer.eingehalten ? "" : "text-red-700"}>
      {puffer.eingehalten ? "" : "−"}
      {puffer.eingehalten ? abstand : ltv ? `${f.zahl(puffer.abstand.abs(), 1)} ${tc.prozentpunkte}` : f.faktor(puffer.abstand.abs())}
      {relativ.replace("-", "−")}
    </span>
  );
  const werte: Array<[ReactNode, ReactNode]> = [
    [tc.aktuellerWert, ltv ? f.prozent(puffer.wert, 1) : f.faktor(puffer.wert)],
    [tc.schwellenwert, ltv ? f.prozent(puffer.schwellenwert, 1) : f.faktor(puffer.schwellenwert)],
    ...puffer.spielraum.map((s): [ReactNode, ReactNode] => [
      s.betrag.isNegative() ? tc.spielraumNoetig[s.art] : tc.spielraum[s.art],
      fuelle(tc.spielraumText, { betrag: f.betrag(s.betrag.abs()), prozent: f.prozent(s.prozent.abs(), 1), basis: f.betrag(s.basis) }),
    ]),
  ];
  return (
    <MitHerleitung
      wert={wert}
      herleitung={{
        berechnung: tc.pufferBerechnung,
        werte,
        quelle: `${t.kennzahlen.restschuld}: ${f.betrag(kz.restschuld)} · ${t.kennzahlen.verkehrswert}: ${f.betrag(kz.verkehrswert)} · ${t.kennzahlen.istMieteJahr}: ${f.betrag(kz.istJahr)} · ${t.kennzahlen.kapitaldienstJahr}: ${f.betrag(kz.kapitaldienstJahr)}`,
        stichtag: `${t.herleitung.stichtagAnsicht}: ${f.datum(stichtag)}`,
        hinweis: tc.pufferHinweis,
      }}
      t={t}
      ausrichtung="rechts"
    />
  );
}
