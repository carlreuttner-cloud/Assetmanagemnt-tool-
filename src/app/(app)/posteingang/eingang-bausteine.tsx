import type { Texte } from "@/i18n";
import { Marke, type Ton } from "@/components/ui";
import { fuelle } from "@/i18n";
import type { Formatierer } from "@/lib/format";
import type { EingangVorschlag, Grund, Sicherheit } from "@/lib/eingang";

const TON: Record<Sicherheit, Ton> = { hoch: "gut", mittel: "warnung", niedrig: "schlecht" };

export function SicherheitMarke({ s, t }: { s: Sicherheit; t: Texte }) {
  return (
    <span title={t.eingang.sicherheitErklaerung[s]}>
      <Marke ton={TON[s]}>{t.eingang.sicherheiten[s]}</Marke>
    </span>
  );
}

/** Text einer Begründung; Datum und Absender-Art werden lesbar gemacht. */
export function grundText(g: Grund, t: Texte, f: Formatierer): string {
  const te = t.eingang;
  const w = { ...g.werte };
  if (w.datum) w.datum = f.datum(w.datum);
  if (w.merkmal) w.merkmal = te.merkmale[w.merkmal as keyof typeof te.merkmale] ?? w.merkmal;
  if (g.schluessel === "absender") {
    const art = t.dateien.absenderArten[w.art as keyof typeof t.dateien.absenderArten] ?? w.art;
    return fuelle(t.dateien.erkanntAbsender[w.grund as keyof typeof t.dateien.erkanntAbsender] ?? te.gruende.absender, { art, begriff: w.begriff });
  }
  return fuelle(te.gruende[g.schluessel], w);
}

export function Gruende({ v, t, f }: { v: EingangVorschlag; t: Texte; f: Formatierer }) {
  return (
    <ul className="list-disc space-y-0.5 pl-5 text-sm text-slate-700" data-gruende>
      {v.gruende.map((g, i) => (
        <li key={i}>{grundText(g, t, f)}</li>
      ))}
    </ul>
  );
}
