import { fuelle, type Texte } from "@/i18n";
import type { Formatierer } from "@/lib/format";
import type { ZinsbindungStufe } from "@/lib/kredit";
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
