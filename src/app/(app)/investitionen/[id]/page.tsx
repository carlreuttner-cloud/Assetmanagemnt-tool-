import Link from "next/link";
import { notFound } from "next/navigation";
import { Formular } from "@/components/formular";
import { Begriff, Glossar } from "@/components/herleitung";
import { Angaben, Feld, Felder, Kachel, Kacheln, Karte, Leer, Marke, Seitenkopf, Tabelle, rechts } from "@/components/ui";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { heute } from "@/lib/datum";
import { erlaubt } from "@/lib/daten/portfolio";
import { formatierer } from "@/lib/format";
import { dezimal } from "@/lib/geld";
import { werteMassnahmeAus } from "@/lib/massnahme";
import { kostenpositionHinzufuegen, kostenpositionLoesen, kostenZuordnen, massnahmeLoeschen } from "../aktionen";
import { MassnahmeFormular } from "../massnahme-formular";
import { AbweichungWert, BudgetWert, IstWert, MehrmieteWert, RenditeWert } from "../massnahme-werte";

export default async function MassnahmeSeite({ params }: PageProps<"/investitionen/[id]">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("haeuser");
  const t = texte(kontext.mandant.sprache);
  const tm = t.massnahmen;
  const f = formatierer(kontext.mandant);
  const sicht = await sichtbarkeit(kontext);
  const schreiben = darf(kontext.rolle, "haeuser", "schreiben");
  const roh = await kontext.db.massnahme.findFirst({
    where: { id, hausId: erlaubt(sicht.hausIds) },
    include: {
      haus: { select: { id: true, bezeichnung: true, einheiten: { orderBy: { bezeichnung: "asc" }, select: { id: true, bezeichnung: true } } } },
      einheit: { select: { bezeichnung: true } },
      kosten: { orderBy: { datum: "asc" } },
    },
  });
  if (!roh) notFound();
  const freie = schreiben
    ? await kontext.db.investition.findMany({ where: { hausId: roh.hausId, massnahmeId: null }, orderBy: { datum: "desc" } })
    : [];
  const daten = {
    status: roh.status,
    budget: roh.budget === null ? null : dezimal(roh.budget),
    mehrmieteMonat: roh.mehrmieteMonat === null ? null : dezimal(roh.mehrmieteMonat),
    kosten: roh.kosten.map((k) => dezimal(k.betrag)),
  };
  const a = werteMassnahmeAus(daten);
  const p = { m: { ...daten, budgetQuelle: roh.budgetQuelle, mehrmieteBelegt: roh.mehrmieteBelegt, mehrmieteQuelle: roh.mehrmieteQuelle }, a, anzahlKosten: roh.kosten.length, t, f };

  return (
    <div className="max-w-5xl space-y-6">
      <Seitenkopf
        titel={
          <>
            {roh.bezeichnung} <Marke ton={roh.status === "ABGESCHLOSSEN" ? "gut" : roh.status === "LAUFEND" ? "warnung" : "neutral"}>{tm.stati[roh.status]}</Marke>
          </>
        }
        beschreibung={[roh.kategorie, roh.haus.bezeichnung, roh.einheit?.bezeichnung].filter(Boolean).join(" · ")}
        zurueck={{ href: "/investitionen", text: tm.titel }}
      />

      <Kacheln>
        <Kachel titel={tm.budget} wert={<BudgetWert {...p} />} />
        <Kachel titel={tm.ist} wert={<IstWert {...p} />} />
        <Kachel titel={tm.abweichung} wert={<AbweichungWert {...p} />} />
        <Kachel titel={<Begriff k="RenditeMassnahme" t={t}>{tm.rendite}</Begriff>} wert={<RenditeWert {...p} art="rendite" />} unter={<RenditeWert {...p} art="amortisation" />} />
      </Kacheln>

      <Karte>
        <Angaben
          eintraege={[
            [tm.haus, <Link key="h" href={`/haeuser/${roh.haus.id}`} className="hover:underline">{roh.haus.bezeichnung}</Link>],
            [tm.einheit, roh.einheit?.bezeichnung ?? tm.ganzesHaus],
            [tm.beginn, roh.beginn ? f.datum(roh.beginn) : "–"],
            [tm.ende, roh.ende ? f.datum(roh.ende) : "–"],
            [<Begriff key="m" k="Mehrmiete" t={t}>{tm.mehrmiete}</Begriff>, <MehrmieteWert key="mw" {...p} />],
            [tm.budgetQuelle, roh.budgetQuelle ?? "–"],
            [tm.notiz, roh.notiz ?? "–"],
          ]}
        />
      </Karte>

      <Karte titel={tm.kostenpositionen}>
        {roh.kosten.length === 0 ? (
          <Leer>{tm.keineKosten}</Leer>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{tm.datum}</th>
                <th>{tm.beschreibung}</th>
                <th className={rechts}>{tm.betrag}</th>
                {schreiben && <th />}
              </tr>
            </thead>
            <tbody>
              {roh.kosten.map((k) => (
                <tr key={k.id}>
                  <td>{f.datum(k.datum)}</td>
                  <td>{k.beschreibung}</td>
                  <td className={rechts}>{f.betrag(k.betrag)}</td>
                  {schreiben && (
                    <td className="text-right">
                      <Formular aktion={kostenpositionLoesen.bind(null, k.id, roh.id)} absenden={tm.loesen} inline />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
            {roh.kosten.length > 1 && a.ist && (
              <tfoot>
                <tr>
                  <td colSpan={2}>{tm.summe}</td>
                  <td className={rechts}>{f.betrag(a.ist)}</td>
                  {schreiben && <td />}
                </tr>
              </tfoot>
            )}
          </Tabelle>
        )}
        {schreiben && (
          <div className="mt-4 space-y-3">
            <details>
              <summary className="cursor-pointer text-sm font-medium text-slate-700">{tm.kostenHinzufuegen}</summary>
              <div className="mt-3">
                <Formular aktion={kostenpositionHinzufuegen.bind(null, roh.id)} absenden={t.allgemein.speichern} zuruecksetzen>
                  <Felder>
                    <Feld name="datum" label={tm.datum} typ="date" wert={heute()} pflicht />
                    <Feld name="betrag" label={tm.betrag} inputMode="decimal" pflicht />
                    <Feld name="beschreibung" label={tm.beschreibung} pflicht breit />
                  </Felder>
                </Formular>
              </div>
            </details>
            <details>
              <summary className="cursor-pointer text-sm font-medium text-slate-700">{tm.kostenZuordnen}</summary>
              <div className="mt-3">
                {freie.length === 0 ? (
                  <Leer>{tm.keineFreien}</Leer>
                ) : (
                  <Formular aktion={kostenZuordnen.bind(null, roh.id)} absenden={tm.zuordnen}>
                    <ul className="space-y-1 text-sm">
                      {freie.map((i) => (
                        <li key={i.id}>
                          <label className="flex items-center gap-2">
                            <input type="checkbox" name="investition" value={i.id} className="h-4 w-4 rounded border-slate-300" />
                            {f.datum(i.datum)} · {i.beschreibung} · {f.betrag(i.betrag)}
                          </label>
                        </li>
                      ))}
                    </ul>
                  </Formular>
                )}
              </div>
            </details>
          </div>
        )}
      </Karte>

      {schreiben && (
        <Karte titel={tm.bearbeiten}>
          <MassnahmeFormular t={t} f={f} m={roh} einheiten={roh.haus.einheiten} />
          <div className="mt-6 border-t border-slate-100 pt-4">
            <p className="mb-2 text-xs text-slate-500">{tm.loeschenHinweis}</p>
            <Formular aktion={massnahmeLoeschen.bind(null, roh.id)} absenden={t.allgemein.loeschen} art="gefahr" bestaetigen={t.allgemein.loeschenBestaetigen} />
          </div>
        </Karte>
      )}
      <Glossar begriffe={["Mehrmiete", "RenditeMassnahme", "Amortisation"]} t={t} />
    </div>
  );
}
