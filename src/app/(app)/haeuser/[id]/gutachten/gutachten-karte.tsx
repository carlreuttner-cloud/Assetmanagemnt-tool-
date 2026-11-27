import Link from "next/link";
import { Begriff, MitHerleitung } from "@/components/herleitung";
import { Angaben, Karte, KnopfLink, Leer } from "@/components/ui";
import { fuelle, type Texte } from "@/i18n";
import type { Formatierer } from "@/lib/format";
import { dezimal } from "@/lib/geld";

type Zahl = { toFixed(): string } | null;

/** Kurzfassung des letzten Gutachtens auf der Hausseite mit Link zur Historie. */
export function GutachtenKarte({
  hausId,
  liste,
  schreiben,
  t,
  f,
}: {
  hausId: string;
  /** nach Stichtag absteigend */
  liste: Array<{ id: string; stichtag: Date; gutachter: string | null; verkehrswert: { toFixed(): string }; rohertragJahr: Zahl; liegenschaftszins: Zahl; restnutzungsdauer: number | null }>;
  schreiben: boolean;
  t: Texte;
  f: Formatierer;
}) {
  const tg = t.gutachten;
  const g = liste[0];
  const fehlt = <span className="text-xs italic text-slate-400">{tg.nichtAngegeben}</span>;
  return (
    <Karte
      titel={tg.titel}
      aktionen={
        <>
          {liste.length > 0 && <KnopfLink href={`/haeuser/${hausId}/gutachten`}>{tg.alleAnzeigen}</KnopfLink>}
          {schreiben && <KnopfLink href={`/haeuser/${hausId}/gutachten/neu`}>{tg.neu}</KnopfLink>}
        </>
      }
    >
      {!g ? (
        <Leer>{tg.keine}</Leer>
      ) : (
        <>
          <p className="mb-3 text-xs text-slate-500">
            {tg.letztes} · {fuelle(tg.anzahl, { anzahl: String(liste.length) })}
          </p>
          <Angaben
            eintraege={[
              [tg.stichtag, <Link key="s" href={`/haeuser/${hausId}/gutachten#g-${g.id}`} className="hover:underline">{f.datum(g.stichtag)}</Link>],
              [tg.gutachter, g.gutachter ?? fehlt],
              [tg.verkehrswert, f.betragGanz(g.verkehrswert)],
              [
                <Begriff key="r" k="Rohertragsfaktor" t={t}>{tg.rohertragsfaktor}</Begriff>,
                g.rohertragJahr && !dezimal(g.rohertragJahr).isZero() ? (
                  <MitHerleitung
                    key="rf"
                    wert={f.faktor(dezimal(g.verkehrswert).dividedBy(dezimal(g.rohertragJahr)), 1)}
                    herleitung={{
                      berechnung: `${tg.verkehrswert} ÷ ${tg.rohertragJahr}`,
                      werte: [
                        [tg.verkehrswert, f.betragGanz(g.verkehrswert)],
                        [tg.rohertragJahr, f.betragGanz(g.rohertragJahr)],
                      ],
                      quelle: tg.titel,
                      stichtag: f.datum(g.stichtag),
                    }}
                    t={t}
                  />
                ) : (
                  fehlt
                ),
              ],
              [<Begriff key="l" k="Liegenschaftszins" t={t}>{tg.liegenschaftszins}</Begriff>, g.liegenschaftszins ? f.prozent(g.liegenschaftszins, 2) : fehlt],
              [
                <Begriff key="n" k="Restnutzungsdauer" t={t}>{tg.restnutzungsdauer}</Begriff>,
                g.restnutzungsdauer !== null ? fuelle(tg.jahre, { jahre: String(g.restnutzungsdauer) }) : fehlt,
              ],
            ]}
          />
        </>
      )}
    </Karte>
  );
}
