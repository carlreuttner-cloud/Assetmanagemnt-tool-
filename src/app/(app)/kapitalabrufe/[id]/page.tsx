import Link from "next/link";
import { notFound } from "next/navigation";
import { Formular } from "@/components/formular";
import { MitHerleitung } from "@/components/herleitung";
import { Angaben, Feld, Felder, Kachel, Kacheln, Karte, KnopfLink, Marke, Seitenkopf, Tabelle, rechts, type Ton } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { heute } from "@/lib/datum";
import { ladeKapitalabrufe } from "@/lib/daten/kapitalabruf";
import { formatierer } from "@/lib/format";
import type { PositionStatus } from "@/lib/kapitalabruf";
import { eingangErfassen, eingangLoeschen, kapitalabrufLoeschen } from "../aktionen";

const STATUS_TON: Record<PositionStatus, Ton> = { offen: "neutral", teilweise: "warnung", bezahlt: "gut", ueberzahlt: "warnung" };

export default async function KapitalabrufSeite({ params }: PageProps<"/kapitalabrufe/[id]">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("gesellschaften");
  const t = texte(kontext.mandant.sprache);
  const tk = t.kapitalabrufe;
  const f = formatierer(kontext.mandant);
  const schreiben = darf(kontext.rolle, "gesellschaften", "schreiben");
  const [a] = await ladeKapitalabrufe(kontext, { id });
  if (!a) notFound();
  const mitEingang = a.positionen.some((p) => p.eingaenge.length > 0);

  return (
    <div className="max-w-6xl space-y-6">
      <Seitenkopf
        titel={a.bezeichnung}
        beschreibung={`${a.gesellschaft} · ${tk.faelligAm} ${f.datum(a.faelligAm)}`}
        zurueck={{ href: "/kapitalabrufe", text: tk.zurUebersicht }}
        aktionen={<KnopfLink href={`/gesellschaften/${a.gesellschaftId}/gesellschafter`}>{t.waterfall.gesellschafterVerwalten}</KnopfLink>}
      />
      <Kacheln>
        <Kachel titel={tk.spalten.betrag} wert={f.betragGanz(a.stand.betrag)} />
        <Kachel titel={tk.spalten.eingegangen} wert={f.betragGanz(a.stand.eingegangen)} unter={a.stand.quote ? f.prozent(a.stand.quote, 0) : undefined} />
        <Kachel titel={tk.spalten.offen} wert={f.betragGanz(a.stand.offen)} ton={a.stand.ueberfaellig > 0 ? "schlecht" : undefined} unter={a.stand.ueberfaellig > 0 ? fuelle(tk.ueberfaelligAnzahl, { anzahl: a.stand.ueberfaellig }) : undefined} />
        <Kachel titel={tk.spalten.status} wert={<Marke ton={STATUS_TON[a.stand.status]}>{tk.status[a.stand.status]}</Marke>} />
      </Kacheln>
      <Karte>
        <Angaben
          eintraege={[
            [tk.gesellschaft, <Link key="g" href={`/gesellschaften/${a.gesellschaftId}`} className="hover:underline">{a.gesellschaft}</Link>],
            [tk.abrufAm, f.datum(a.abrufAm)],
            [tk.faelligAm, f.datum(a.faelligAm)],
            [t.allgemein.notiz, a.notiz],
            ...(a.erstelltVon ? ([["", fuelle(tk.erstellt, { name: a.erstelltVon })]] as Array<[string, string]>) : []),
          ]}
        />
      </Karte>

      <Karte titel={tk.spalten.gesellschafter}>
        <Tabelle>
          <thead>
            <tr>
              <th>{tk.spalten.gesellschafter}</th>
              <th className={rechts}>{tk.spalten.anteil}</th>
              <th className={rechts}>{tk.spalten.betrag}</th>
              <th className={rechts}>{tk.spalten.eingegangen}</th>
              <th className={rechts}>{tk.spalten.offen}</th>
              <th>{tk.spalten.status}</th>
            </tr>
          </thead>
          <tbody>
            {a.positionen.map((p) => (
              <tr key={p.id} className="align-top" data-position={p.gesellschafter}>
                <td>
                  <span className="font-medium">{p.gesellschafter}</span>
                  {p.eingaenge.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs text-slate-600">
                      {p.eingaenge.map((e) => (
                        <li key={e.id} className="flex items-center gap-2">
                          <span>
                            {f.datum(e.datum)} · {f.betrag(e.betrag)}
                            {e.quelle ? ` · ${e.quelle}` : ""}
                          </span>
                          {schreiben && <Formular aktion={eingangLoeschen.bind(null, e.id)} absenden={tk.eingangLoeschen} art="gefahr" bestaetigen={t.allgemein.loeschenBestaetigen} inline />}
                        </li>
                      ))}
                    </ul>
                  )}
                  {schreiben && p.stand.offen.greaterThan(0) && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-xs text-sky-700">{tk.eingang}</summary>
                      <Formular aktion={eingangErfassen.bind(null, p.id)} absenden={t.allgemein.speichern} className="mt-2">
                        <Felder>
                          <Feld name="betrag" label={tk.eingangBetrag} wert={f.eingabe(p.stand.offen, 2)} inputMode="decimal" pflicht />
                          <Feld name="datum" label={tk.eingangDatum} typ="date" wert={heute()} pflicht />
                          <Feld name="quelle" label={tk.eingangQuelle} />
                        </Felder>
                      </Formular>
                    </details>
                  )}
                </td>
                <td className={rechts}>{f.prozent(p.anteilProzent, 2)}</td>
                <td className={rechts}>
                  <MitHerleitung wert={f.betrag(p.betrag)} herleitung={{ berechnung: tk.herleitungAnteil, werte: [[tk.gesamtbetrag, f.betrag(a.stand.betrag)], [tk.spalten.anteil, f.prozent(p.anteilProzent, 4)]] }} t={t} ausrichtung="rechts" />
                </td>
                <td className={rechts}>{f.betrag(p.stand.eingegangen)}</td>
                <td className={rechts}>
                  <MitHerleitung wert={f.betrag(p.stand.offen)} herleitung={{ berechnung: tk.herleitungOffen, werte: [[tk.spalten.betrag, f.betrag(p.betrag)], [tk.spalten.eingegangen, f.betrag(p.stand.eingegangen)]] }} t={t} ausrichtung="rechts" />
                </td>
                <td>
                  <Marke ton={STATUS_TON[p.stand.status]}>{tk.status[p.stand.status]}</Marke> {p.stand.ueberfaellig && <Marke ton="schlecht">{tk.ueberfaellig}</Marke>}
                </td>
              </tr>
            ))}
          </tbody>
        </Tabelle>
        <p className="mt-3 text-xs text-slate-500">{tk.kapitalkonto}</p>
      </Karte>
      {schreiben && !mitEingang && <Formular aktion={kapitalabrufLoeschen.bind(null, a.id)} absenden={tk.loeschen} art="gefahr" bestaetigen={t.allgemein.loeschenBestaetigen} />}
    </div>
  );
}
