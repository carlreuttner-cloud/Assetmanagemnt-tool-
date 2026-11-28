import { notFound } from "next/navigation";
import { Formular } from "@/components/formular";
import { Begriff } from "@/components/herleitung";
import { Ankreuzfeld, Auswahl, Feld, Felder, Karte, KnopfLink, Leer, Seitenkopf, Tabelle, rechts } from "@/components/ui";
import { Liniendiagramm, type Reihe } from "@/components/diagramme";
import { KapitalkontoTabelle } from "@/components/kapitalkonto-tabelle";
import { fuelle, texte } from "@/i18n";
import { heute, isoDatum } from "@/lib/datum";
import { dezimal } from "@/lib/geld";
import { kontoverlauf } from "@/lib/kapitalkonto";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { erlaubt } from "@/lib/daten/portfolio";
import { formatierer } from "@/lib/format";
import {
  bewegungHinzufuegen,
  bewegungLoeschen,
  gesellschafterAendern,
  gesellschafterLoeschen,
  gesellschafterSpeichern,
  waterfallvertragLoeschen,
  waterfallvertragSpeichern,
} from "../../aktionen";

export default async function GesellschafterSeite({ params }: PageProps<"/gesellschaften/[id]/gesellschafter">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("gesellschaften");
  const t = texte(kontext.mandant.sprache);
  const f = formatierer(kontext.mandant);
  const tw = t.waterfall;
  const sicht = await sichtbarkeit(kontext);
  const g = await kontext.db.gesellschaft.findFirst({
    where: { id: erlaubt(sicht.gesellschaftIds, id) },
    select: {
      id: true,
      name: true,
      waterfallvertrag: true,
      gesellschafter: { orderBy: { name: "asc" }, include: { bewegungen: { orderBy: [{ datum: "asc" }] } } },
    },
  });
  if (!g) notFound();
  const schreiben = darf(kontext.rolle, "gesellschaften", "schreiben");
  // Investoren, die dieser Gesellschaft zugewiesen sind, können mit einem Kapitalkonto verknüpft werden (Investorenportal)
  const zugaenge = (
    await kontext.db.mitgliedschaft.findMany({
      where: { rolle: "INVESTOR", gesellschaftZuweisungen: { some: { gesellschaftId: id } } },
      select: { id: true, benutzer: { select: { name: true, email: true } } },
    })
  ).map((m) => ({ wert: m.id, text: m.benutzer.name ? `${m.benutzer.name} (${m.benutzer.email})` : m.benutzer.email }));
  const v = g.waterfallvertrag;
  const tk = t.kapitalkonten;
  const stichtag = heute();
  const konten = g.gesellschafter.map((gs) => ({
    id: gs.id,
    name: gs.name,
    beteiligungProzent: gs.beteiligungProzent === null ? null : dezimal(gs.beteiligungProzent),
    bewegungen: gs.bewegungen.map((b) => ({ art: b.art, datum: isoDatum(b.datum), betrag: dezimal(b.betrag) })),
  }));
  const verlaeufe = konten.map((k) => kontoverlauf(k.bewegungen, Number(stichtag.slice(0, 4))));
  const reihen: Reihe[] = konten.map((k, i) => ({
    name: k.name,
    punkte: verlaeufe[i].jahre.map((j) => ({ x: j.jahr === Number(stichtag.slice(0, 4)) ? stichtag : `${j.jahr}-12-31`, y: j.saldoEnde })),
  }));

  return (
    <div className="max-w-6xl space-y-6">
      <Seitenkopf
        titel={tw.gesellschafter}
        beschreibung={`${g.name} · ${tw.gesellschafterBeschreibung}`}
        zurueck={{ href: `/gesellschaften/${id}`, text: g.name }}
        aktionen={<KnopfLink href={`/gesellschaften/${id}/waterfall`} art="primaer">{tw.oeffnen}</KnopfLink>}
      />

      <Karte titel={tw.vertrag}>
        {v ? (
          <dl className="mb-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-slate-500"><Begriff k="Vorzugsrendite" t={t}>{tw.vorzugsrendite}</Begriff></dt>
              <dd>{f.prozent(v.vorzugsrenditeProzent, 2)} p. a., {tw.verzinsungen[v.verzinsung]}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{tw.anrechnen}</dt>
              <dd>{v.ausschuettungenAnrechnen ? t.allgemein.ja : t.allgemein.nein}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-500">{tw.quelle}</dt>
              <dd>{v.quelle}</dd>
            </div>
          </dl>
        ) : (
          <p className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800">{tw.vertragFehlt}</p>
        )}
        {schreiben && (
          <details>
            <summary className="cursor-pointer text-sm font-medium text-slate-700">{t.allgemein.bearbeiten}</summary>
            <div className="mt-3 space-y-3">
              <Formular aktion={waterfallvertragSpeichern.bind(null, id)} absenden={t.allgemein.speichern}>
                <Felder>
                  <Feld name="vorzugsrenditeProzent" label={`${tw.vorzugsrendite} (%)`} wert={f.eingabe(v?.vorzugsrenditeProzent)} inputMode="decimal" hinweis={tw.vorzugsrenditeHinweis} pflicht />
                  <Auswahl name="verzinsung" label={tw.verzinsung} wert={v?.verzinsung ?? "EINFACH"} optionen={(["EINFACH", "ZINSESZINS"] as const).map((x) => ({ wert: x, text: tw.verzinsungen[x] }))} pflicht />
                  <Feld name="quelle" label={tw.vertragQuelle} wert={v?.quelle} pflicht breit />
                  <Ankreuzfeld name="ausschuettungenAnrechnen" label={tw.anrechnen} wert={v?.ausschuettungenAnrechnen ?? true} />
                </Felder>
              </Formular>
              {v && <Formular aktion={waterfallvertragLoeschen.bind(null, id)} absenden={tw.regelLoeschen} art="gefahr" bestaetigen={t.allgemein.loeschenBestaetigen} />}
            </div>
          </details>
        )}
      </Karte>

      {konten.length > 0 && (
        <Karte titel={tk.titel}>
          <KapitalkontoTabelle gesellschafter={konten} stichtag={stichtag} link={(gid) => `#gs-${gid}`} t={t} f={f} />
          {reihen.some((r) => r.punkte.length > 1) && (
            <div className="mt-4 max-w-3xl">
              <h3 className="mb-1 text-sm font-medium">{tk.diagramm}</h3>
              <Liniendiagramm reihen={reihen} formatY={(w) => f.betragKurz(w)} formatX={(d) => d.slice(0, 4)} ab0 />
            </div>
          )}
        </Karte>
      )}

      {g.gesellschafter.length === 0 && (
        <Karte>
          <Leer>{tw.keineGesellschafter}</Leer>
        </Karte>
      )}

      {g.gesellschafter.map((gs, nr) => (
        <div key={gs.id} id={`gs-${gs.id}`} className="scroll-mt-4">
        <Karte
          titel={gs.name}
          aktionen={
            <span className="text-sm text-slate-600">
              {tw.beteiligung}: {f.prozent(gs.beteiligungProzent, 2)} · {tw.gewinnanteil}: {gs.gewinnanteilProzent === null ? t.allgemein.unbekannt : f.prozent(gs.gewinnanteilProzent, 2)}
            </span>
          }
        >
          {verlaeufe[nr].jahre.length > 0 && (
            <details className="mb-4">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">{tk.verlauf}</summary>
              <p className="mt-2 text-xs text-slate-500">{tk.verlaufHinweis}</p>
              <Tabelle>
                <thead>
                  <tr>
                    <th>{tk.jahr}</th>
                    <th className={rechts}>{tk.einlagen}</th>
                    <th className={rechts}>{tk.rueckzahlungen}</th>
                    <th className={rechts}>{tk.ausschuettungen}</th>
                    <th className={rechts}>{tk.saldoEnde}</th>
                  </tr>
                </thead>
                <tbody>
                  {verlaeufe[nr].jahre.map((j) => (
                    <tr key={j.jahr}>
                      <td>{j.jahr}</td>
                      <td className={rechts}>{j.einlagen.isZero() ? "–" : f.betragGanz(j.einlagen)}</td>
                      <td className={rechts}>{j.rueckzahlungen.isZero() ? "–" : f.betragGanz(j.rueckzahlungen)}</td>
                      <td className={rechts}>{j.ausschuettungen.isZero() ? "–" : f.betragGanz(j.ausschuettungen)}</td>
                      <td className={`${rechts} font-medium`}>{f.betragGanz(j.saldoEnde)}</td>
                    </tr>
                  ))}
                </tbody>
              </Tabelle>
              {verlaeufe[nr].ohneDatum && (
                <p className="mt-2 text-xs text-amber-700">
                  {fuelle(tk.ohneDatum, { anzahl: verlaeufe[nr].ohneDatum!.anzahl })}: {tk.einlagen} {f.betragGanz(verlaeufe[nr].ohneDatum!.einlagen)}. {tk.ohneDatumHinweis}
                </p>
              )}
            </details>
          )}
          <h3 className="mb-2 text-sm font-medium text-slate-700">{tw.bewegungen}</h3>
          {gs.bewegungen.length === 0 ? (
            <p className="text-sm text-amber-700">{tw.keineBewegungen}</p>
          ) : (
            <Tabelle>
              <thead>
                <tr>
                  <th>{tw.datum}</th>
                  <th>{tw.art}</th>
                  <th className={rechts}>{tw.betrag}</th>
                  <th>{tw.quelle}</th>
                  {schreiben && <th />}
                </tr>
              </thead>
              <tbody>
                {gs.bewegungen.map((b) => (
                  <tr key={b.id}>
                    <td>{b.datum ? f.datum(b.datum) : <span className="italic text-amber-700">{tw.datumUnbekannt}</span>}</td>
                    <td>{tw.arten[b.art]}</td>
                    <td className={rechts}>{f.betrag(b.betrag)}</td>
                    <td className="text-slate-500">{b.quelle}</td>
                    {schreiben && (
                      <td className="text-right">
                        <Formular aktion={bewegungLoeschen.bind(null, b.id, id)} absenden={t.allgemein.loeschen} bestaetigen={t.allgemein.loeschenBestaetigen} inline />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </Tabelle>
          )}
          {schreiben && (
            <div className="mt-4 space-y-3">
              <details>
                <summary className="cursor-pointer text-sm font-medium text-slate-700">{t.allgemein.hinzufuegen}</summary>
                <div className="mt-3">
                  <Formular aktion={bewegungHinzufuegen.bind(null, { gesellschafterId: gs.id, gesellschaftId: id })} absenden={t.allgemein.speichern} zuruecksetzen>
                    <Felder>
                      <Auswahl name="art" label={tw.art} optionen={(["EINLAGE", "RUECKZAHLUNG", "AUSSCHUETTUNG"] as const).map((a) => ({ wert: a, text: tw.arten[a] }))} pflicht />
                      <Feld name="datum" label={tw.datum} typ="date" />
                      <Feld name="betrag" label={tw.betrag} inputMode="decimal" pflicht />
                      <Feld name="quelle" label={tw.quelle} />
                    </Felder>
                  </Formular>
                </div>
              </details>
              <details>
                <summary className="cursor-pointer text-sm font-medium text-slate-700">{t.allgemein.bearbeiten}</summary>
                <div className="mt-3 space-y-3">
                  <Formular aktion={gesellschafterAendern.bind(null, { id: gs.id, gesellschaftId: id })} absenden={t.allgemein.speichern}>
                    <GesellschafterFelder t={t} zugaenge={zugaenge} wert={{ name: gs.name, beteiligung: f.eingabe(gs.beteiligungProzent), gewinnanteil: f.eingabe(gs.gewinnanteilProzent), notiz: gs.notiz, zugang: gs.mitgliedschaftId }} />
                  </Formular>
                  <Formular aktion={gesellschafterLoeschen.bind(null, gs.id, id)} absenden={t.allgemein.loeschen} art="gefahr" bestaetigen={t.allgemein.loeschenBestaetigen} />
                </div>
              </details>
            </div>
          )}
        </Karte>
        </div>
      ))}

      {schreiben && (
        <Karte titel={t.allgemein.hinzufuegen}>
          <Formular aktion={gesellschafterSpeichern.bind(null, id)} absenden={t.allgemein.speichern} zuruecksetzen>
            <GesellschafterFelder t={t} zugaenge={zugaenge} />
          </Formular>
        </Karte>
      )}
    </div>
  );
}

function GesellschafterFelder({
  t,
  wert,
  zugaenge,
}: {
  t: ReturnType<typeof texte>;
  wert?: { name: string; beteiligung: string; gewinnanteil: string; notiz: string | null; zugang: string | null };
  zugaenge: Array<{ wert: string; text: string }>;
}) {
  const tw = t.waterfall;
  return (
    <Felder>
      <Feld name="name" label={tw.name} wert={wert?.name} pflicht />
      <Feld name="beteiligungProzent" label={`${tw.beteiligung} (%)`} wert={wert?.beteiligung} inputMode="decimal" />
      <Feld name="gewinnanteilProzent" label={`${tw.gewinnanteil} (%)`} wert={wert?.gewinnanteil} inputMode="decimal" hinweis={tw.gewinnanteilHinweis} />
      <Feld name="notiz" label={t.allgemein.notiz} wert={wert?.notiz} />
      <Auswahl name="mitgliedschaftId" label={tw.portalZugang} wert={wert?.zugang} optionen={zugaenge} leerText={tw.portalKeiner} hinweis={tw.portalHinweis} />
    </Felder>
  );
}
