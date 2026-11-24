import Link from "next/link";
import { fuelle, type Texte } from "@/i18n";
import type { Checkliste } from "@/lib/daten/dokumente";
import { VORWARNUNG_TAGE, type Bezug, type DokumentStatus } from "@/lib/dokumente";
import { Karte, KnopfLink, Leer, Marke, type Ton } from "./ui";

const TON: Record<DokumentStatus, Ton> = {
  vorhanden: "gut",
  laeuftAb: "warnung",
  veraltet: "schlecht",
  datumFehlt: "warnung",
  fehlt: "schlecht",
  nichtErforderlich: "neutral",
};

export function DokumentStatusMarke({ status, t, titel }: { status: DokumentStatus; t: Texte; titel?: string }) {
  return (
    <span title={titel ?? fuelle(t.dokumente.statusErklaerung[status], { tage: VORWARNUNG_TAGE })}>
      <Marke ton={TON[status]}>{t.dokumente.statusArten[status]}</Marke>
    </span>
  );
}

export const BEZUG_PFAD: Record<Bezug, string> = { GESELLSCHAFT: "gesellschaft", HAUS: "haus", KREDIT: "kredit" };

/** Kurzfassung der Checkliste eines Objekts (z. B. auf der Haus- oder Gesellschaftsseite). */
export function DokumenteKarte({ checkliste, bezug, id, t }: { checkliste: Checkliste; bezug: Bezug; id: string; t: Texte }) {
  const td = t.dokumente;
  const zeile = checkliste.zeilen[0];
  const offen = zeile?.zellen.filter((z) => ["fehlt", "veraltet", "datumFehlt", "laeuftAb"].includes(z.bewertung.status)) ?? [];
  return (
    <Karte titel={td.titel} aktionen={<KnopfLink href={`/dokumente/${BEZUG_PFAD[bezug]}/${id}`}>{td.checkliste}</KnopfLink>}>
      {!zeile || zeile.zellen.length === 0 ? (
        <Leer>{td.keineVorgaben}</Leer>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-600">
            <span className="font-semibold">
              {zeile.zaehlung.offen} {td.offen}
            </span>{" "}
            ({td.offenErklaerung}) · {zeile.zaehlung.vorhanden + zeile.zaehlung.laeuftAb} {td.statusArten.vorhanden}
          </p>
          {offen.length > 0 && (
            <ul className="space-y-1.5 text-sm">
              {offen.map((z) => (
                <li key={z.vorgabe.id} className="flex items-center justify-between gap-2">
                  <Link href={`/dokumente/${BEZUG_PFAD[bezug]}/${id}#v-${z.vorgabe.id}`} className="hover:underline">
                    {z.vorgabe.name}
                  </Link>
                  <DokumentStatusMarke status={z.bewertung.status} t={t} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Karte>
  );
}
