import Link from "next/link";
import { notFound } from "next/navigation";
import { BEZUG_PFAD, DokumentStatusMarke } from "@/components/dokumente";
import { Begriff, RestschuldWert, ZinssatzWert } from "@/components/herleitung";
import { Angaben, Karte, KnopfLink, Leer, Marke, Seitenkopf, Tabelle } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { heute } from "@/lib/datum";
import { ladeCheckliste } from "@/lib/daten/dokumente";
import { ladeRechengrundlage } from "@/lib/daten/portfolio";
import { formatierer } from "@/lib/format";
import { restschuldNachweis } from "@/lib/kredit";
import { phase, refinanzierungsEreignis } from "@/lib/refinanzierung";
import { unterlagenStand } from "../unterlagen";

export default async function RefinanzierungFall({ params }: PageProps<"/refinanzierung/[id]">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("gesellschaften");
  const t = texte(kontext.mandant.sprache);
  const tr = t.refinanzierung;
  const f = formatierer(kontext.mandant);
  const stichtag = heute();
  const grundlage = await ladeRechengrundlage(kontext);
  const daten = grundlage.kredite.find((k) => k.id === id);
  if (!daten) notFound();
  const kredit = await kontext.db.kredit.findFirst({ where: { id }, select: { bezeichnung: true, bank: true, gesellschaft: { select: { name: true } } } });
  if (!kredit) notFound();
  const ereignis = refinanzierungsEreignis(daten);
  const p = ereignis ? phase(ereignis, stichtag) : null;
  const dokumente = darf(kontext.rolle, "dokumente");
  const unterlagen = dokumente ? unterlagenStand(await ladeCheckliste(kontext), daten, grundlage.haeuser) : null;

  return (
    <div className="max-w-5xl space-y-6">
      <Seitenkopf
        titel={kredit.bezeichnung}
        beschreibung={ereignis && p ? fuelle(tr.kopf, { ereignis: tr.ereignisse[ereignis.art], datum: f.datum(ereignis.datum), phase: tr.phasen[p] }) : tr.keinEreignis}
        aktionen={
          <div className="flex gap-2">
            <KnopfLink href={`/gesellschaften/kredite/${id}`}>{tr.kreditseite}</KnopfLink>
            {darf(kontext.rolle, "gesellschaften", "schreiben") && <KnopfLink href="/kredite/angebote">{tr.angebote}</KnopfLink>}
          </div>
        }
      />
      <Karte>
        <Angaben
          eintraege={[
            [t.kredite.bank, kredit.bank ?? "–"],
            [t.listen.gesellschaft, kredit.gesellschaft.name],
            [tr.spalten.ereignis, ereignis ? tr.ereignisse[ereignis.art] : "–"],
            [tr.spalten.datum, ereignis ? f.datum(ereignis.datum) : "–"],
            [tr.spalten.phase, p ? <Marke ton={p === "vorbereiten" ? "warnung" : p === "spaeter" ? "neutral" : "schlecht"}>{tr.phasen[p]}</Marke> : "–"],
            [tr.spalten.restschuld, <RestschuldWert key="r" nachweis={restschuldNachweis(daten, stichtag)} t={t} f={f} ausrichtung="links" ganz />],
            [tr.spalten.zinssatz, <ZinssatzWert key="z" k={daten} referenzwerte={grundlage.referenzwerte} stichtag={stichtag} t={t} f={f} ausrichtung="links" />],
          ]}
        />
      </Karte>

      {unterlagen && (
        <Karte titel={tr.detail}>
          <p className="mb-3 text-sm text-slate-600">{tr.detailHinweis}</p>
          {unterlagen.zeilen.length === 0 ? (
            <Leer>{tr.keineVorgaben}</Leer>
          ) : (
            unterlagen.zeilen.map((z) => (
              <div key={`${z.objekt.bezug}-${z.objekt.id}`} className="mb-5" data-unterlagen={z.objekt.bezug}>
                <h3 className="mb-2 flex items-center justify-between text-sm font-semibold text-slate-800">
                  <span>
                    {tr.objektArten[z.objekt.bezug]}: {z.objekt.name}
                  </span>
                  <Link href={`/dokumente/${BEZUG_PFAD[z.objekt.bezug]}/${z.objekt.id}`} className="text-xs font-normal text-sky-700 hover:underline">
                    {tr.bearbeiten} →
                  </Link>
                </h3>
                {z.zellen.length === 0 ? (
                  <Leer>{tr.keineVorgaben}</Leer>
                ) : (
                  <Tabelle>
                    <tbody>
                      {z.zellen.map((c) => (
                        <tr key={c.vorgabe.id}>
                          <td>
                            {c.vorgabe.name}
                            {c.vorgabe.beschreibung && <div className="text-xs text-slate-500">{c.vorgabe.beschreibung}</div>}
                          </td>
                          <td>
                            <DokumentStatusMarke status={c.bewertung.status} t={t} />
                          </td>
                          <td className="text-xs text-slate-500">
                            {c.bewertung.datum && `${t.allgemein.stand} ${f.datum(c.bewertung.datum)}`}
                            {c.bewertung.gueltigBis && ` · ${t.dokumente.gueltigBis} ${f.datum(c.bewertung.gueltigBis)}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Tabelle>
                )}
              </div>
            ))
          )}
          <p className="text-sm">
            <Begriff k="Refinanzierung" t={t} /> ·{" "}
            <Link href="/refinanzierung" className="text-sky-700 hover:underline">
              {tr.zurUebersicht}
            </Link>
          </p>
        </Karte>
      )}
    </div>
  );
}
