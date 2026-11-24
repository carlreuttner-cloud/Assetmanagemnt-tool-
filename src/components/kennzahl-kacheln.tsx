/**
 * Standard-Kacheln für Gesellschaft, Haus und Portfolio: jeder Wert mit Herleitung,
 * Abkürzungen erklärt, fehlende Werte als „unbekannt“.
 */
import type { Texte } from "@/i18n";
import type { Formatierer } from "@/lib/format";
import type { Kennzahlen } from "@/lib/kennzahlen";
import { Begriff, Kennzahl } from "./herleitung";
import { Kachel, Kacheln } from "./ui";

export function KennzahlKacheln({ k, t, f, stichtag, mitEinheiten = true }: { k: Kennzahlen; t: Texte; f: Formatierer; stichtag: string; mitEinheiten?: boolean }) {
  const tk = t.kennzahlen;
  const p = { k, t, f, stichtag };
  return (
    <Kacheln>
      <Kachel
        titel={tk.verkehrswert}
        wert={<Kennzahl art="verkehrswert" {...p} ganz />}
        unter={mitEinheiten ? `${k.haeuser} ${tk.haeuser}, ${k.einheiten} ${tk.einheiten}` : undefined}
      />
      <Kachel
        titel={<Begriff k="Restschuld" t={t}>{tk.restschuld}</Begriff>}
        wert={<Kennzahl art="restschuld" {...p} ganz />}
        unter={
          <>
            <Begriff k="LTV" t={t} /> <Kennzahl art="ltv" {...p} />
          </>
        }
      />
      <Kachel
        titel={tk.sollMieteMonat}
        wert={<Kennzahl art="sollMonat" {...p} />}
        unter={
          <>
            {tk.sollMieteJahr} (<Begriff k="JNKM" t={t} />): <Kennzahl art="sollJahr" {...p} />
          </>
        }
      />
      <Kachel
        titel={tk.istMieteMonat}
        wert={<Kennzahl art="istMonat" {...p} />}
        unter={
          <>
            {tk.istMieteJahr}: <Kennzahl art="istJahr" {...p} />
          </>
        }
      />
      <Kachel
        titel={<Begriff k="Leerstand" t={t}>{tk.leerstandFlaeche}</Begriff>}
        wert={<Kennzahl art="leerstand" {...p} />}
        unter={
          <>
            {tk.erwartetLeer}: <Kennzahl art="erwartetLeerMonat" {...p} /> / {f.betrag(k.erwartetLeerJahr)}
          </>
        }
      />
      <Kachel
        titel={<Begriff k="Kapitaldienst" t={t}>{tk.kapitaldienstJahr}</Begriff>}
        wert={<Kennzahl art="kapitaldienst" {...p} ganz />}
        unter={
          <>
            {tk.zinsenJahr}: <Kennzahl art="zinsen" {...p} ganz />
          </>
        }
      />
      <Kachel
        titel={
          <>
            <Begriff k="DSCR" t={t} /> / <Begriff k="ICR" t={t} />
          </>
        }
        wert={<Kennzahl art="dscr" {...p} />}
        unter={
          <>
            <Begriff k="ICR" t={t} /> <Kennzahl art="icr" {...p} />
          </>
        }
      />
      <Kachel
        titel={<Begriff k="BAR" t={t}>{tk.bruttoanfangsrendite}</Begriff>}
        wert={<Kennzahl art="bruttoanfangsrendite" {...p} />}
        unter={
          <>
            <Begriff k="Kaufpreisfaktor" t={t}>{tk.kaufpreisfaktor}</Begriff>: <Kennzahl art="kaufpreisfaktor" {...p} />
          </>
        }
      />
    </Kacheln>
  );
}
