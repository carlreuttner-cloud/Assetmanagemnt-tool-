import { Jahressaeulen } from "@/components/diagramme";
import { Begriff, Hinweismarke, Unbekannt } from "@/components/herleitung";
import { Angaben, Karte, KnopfLink, Leer } from "@/components/ui";
import type { Texte } from "@/i18n";
import type { GeschaeftsjahrZeile } from "@/lib/daten/finanzen";
import { finanzVerlauf } from "@/lib/finanzen";
import type { Formatierer } from "@/lib/format";

/** Kurzfassung der Finanzen auf der Gesellschaftsseite: EBITDA je Geschäftsjahr und das letzte Jahr. */
export function FinanzKarte({ gesellschaftId, jahre, schreiben, t, f }: { gesellschaftId: string; jahre: GeschaeftsjahrZeile[]; schreiben: boolean; t: Texte; f: Formatierer }) {
  const tf = t.finanzen;
  const verlauf = finanzVerlauf(jahre);
  const letztes = [...verlauf].reverse().find((s) => s.daten);
  const zeige = (w: Parameters<Formatierer["betragGanz"]>[0] | null) => (w == null ? <Unbekannt t={t} /> : f.betragGanz(w));
  return (
    <Karte
      titel={tf.titel}
      aktionen={
        <>
          {verlauf.length > 0 && <KnopfLink href={`/gesellschaften/${gesellschaftId}/finanzen`}>{tf.oeffnen}</KnopfLink>}
          {schreiben && <KnopfLink href={`/gesellschaften/${gesellschaftId}/finanzen/neu`}>{tf.neu}</KnopfLink>}
        </>
      }
    >
      {!letztes?.daten || !letztes.k ? (
        <Leer>{tf.keine}</Leer>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-medium text-slate-700">
              <Begriff k="EBITDA" t={t}>
                {tf.diagrammEbitda}
              </Begriff>
            </h3>
            <Jahressaeulen
              jahre={verlauf.map((s) => ({ jahr: s.jahr, wert: s.k?.ebitda ?? null, entwurf: s.daten?.status === "ENTWURF" }))}
              format={(w) => f.betragGanz(w)}
              formatKurz={(w) => f.betragKurz(w)}
              legende={{ beleg: t.abschlussStatus.ENDGUELTIG, entwurf: t.abschlussStatus.ENTWURF, plan: "" }}
            />
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium text-slate-700">
              {tf.letztesJahr}: {letztes.jahr}
              {letztes.daten.status === "ENTWURF" && <Hinweismarke>{t.abschlussStatus.ENTWURF}</Hinweismarke>}
            </h3>
            <Angaben
              eintraege={[
                [tf.quelle, letztes.daten.quelleText ?? t.abschlussQuellen[letztes.daten.quelle]],
                [tf.posten.umsatzerloese, zeige(letztes.daten.umsatzerloese)],
                [<Begriff key="e" k="EBITDA" t={t} />, zeige(letztes.k.ebitda)],
                [tf.posten.jahresergebnis, zeige(letztes.daten.jahresergebnis)],
                [
                  <Begriff key="q" k="Eigenkapitalquote" t={t}>
                    {tf.eigenkapitalquote}
                  </Begriff>,
                  letztes.k.eigenkapitalquote ? f.prozent(letztes.k.eigenkapitalquote, 1) : <Unbekannt t={t} />,
                ],
              ]}
            />
          </div>
        </div>
      )}
    </Karte>
  );
}
