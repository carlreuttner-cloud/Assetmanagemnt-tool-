import { notFound } from "next/navigation";
import { Formular } from "@/components/formular";
import { Begriff } from "@/components/herleitung";
import { Ankreuzfeld, Auswahl, Feld, Felder, Karte, KnopfLink, Leer, Seitenkopf, Tabelle, rechts } from "@/components/ui";
import { texte } from "@/i18n";
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
  const v = g.waterfallvertrag;

  return (
    <div className="max-w-5xl space-y-6">
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

      {g.gesellschafter.length === 0 && (
        <Karte>
          <Leer>{tw.keineGesellschafter}</Leer>
        </Karte>
      )}

      {g.gesellschafter.map((gs) => (
        <Karte
          key={gs.id}
          titel={gs.name}
          aktionen={
            <span className="text-sm text-slate-600">
              {tw.beteiligung}: {f.prozent(gs.beteiligungProzent, 2)} · {tw.gewinnanteil}: {gs.gewinnanteilProzent === null ? t.allgemein.unbekannt : f.prozent(gs.gewinnanteilProzent, 2)}
            </span>
          }
        >
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
                    <GesellschafterFelder t={t} wert={{ name: gs.name, beteiligung: f.eingabe(gs.beteiligungProzent), gewinnanteil: f.eingabe(gs.gewinnanteilProzent), notiz: gs.notiz }} />
                  </Formular>
                  <Formular aktion={gesellschafterLoeschen.bind(null, gs.id, id)} absenden={t.allgemein.loeschen} art="gefahr" bestaetigen={t.allgemein.loeschenBestaetigen} />
                </div>
              </details>
            </div>
          )}
        </Karte>
      ))}

      {schreiben && (
        <Karte titel={t.allgemein.hinzufuegen}>
          <Formular aktion={gesellschafterSpeichern.bind(null, id)} absenden={t.allgemein.speichern} zuruecksetzen>
            <GesellschafterFelder t={t} />
          </Formular>
        </Karte>
      )}
    </div>
  );
}

function GesellschafterFelder({ t, wert }: { t: ReturnType<typeof texte>; wert?: { name: string; beteiligung: string; gewinnanteil: string; notiz: string | null } }) {
  const tw = t.waterfall;
  return (
    <Felder>
      <Feld name="name" label={tw.name} wert={wert?.name} pflicht />
      <Feld name="beteiligungProzent" label={`${tw.beteiligung} (%)`} wert={wert?.beteiligung} inputMode="decimal" />
      <Feld name="gewinnanteilProzent" label={`${tw.gewinnanteil} (%)`} wert={wert?.gewinnanteil} inputMode="decimal" hinweis={tw.gewinnanteilHinweis} />
      <Feld name="notiz" label={t.allgemein.notiz} wert={wert?.notiz} />
    </Felder>
  );
}
