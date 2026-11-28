import Link from "next/link";
import { Formular } from "@/components/formular";
import { Begriff, Glossar } from "@/components/herleitung";
import { Auswahl, Feld, Felder, Kachel, Kacheln, Karte, Leer, Marke, Seitenkopf, Tabelle, Textfeld, rechts, type Ton } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { bereichsSicht } from "@/lib/auth/auswahl";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { idFilter } from "@/lib/auth/sichtbarkeit";
import { heute } from "@/lib/datum";
import { ladeKapitalabrufe } from "@/lib/daten/kapitalabruf";
import { formatierer } from "@/lib/format";
import { dezimal } from "@/lib/geld";
import type { PositionStatus } from "@/lib/kapitalabruf";
import { kapitalabrufAnlegen } from "./aktionen";

const STATUS_TON: Record<PositionStatus, Ton> = { offen: "neutral", teilweise: "warnung", bezahlt: "gut", ueberzahlt: "warnung" };

export default async function KapitalabrufeSeite() {
  const kontext = await pruefeZugriff("gesellschaften");
  const t = texte(kontext.mandant.sprache);
  const tk = t.kapitalabrufe;
  const f = formatierer(kontext.mandant);
  const schreiben = darf(kontext.rolle, "gesellschaften", "schreiben");
  const sicht = await bereichsSicht(kontext);
  const [abrufe, gesellschaften] = await Promise.all([
    ladeKapitalabrufe(kontext),
    kontext.db.gesellschaft.findMany({ where: { id: idFilter(sicht.gesellschaftIds), gesellschafter: { some: {} } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const summe = (w: (a: (typeof abrufe)[number]) => ReturnType<typeof dezimal>) => abrufe.reduce((s, a) => s.plus(w(a)), dezimal(0));
  const ueberfaellig = abrufe.reduce((n, a) => n + a.stand.ueberfaellig, 0);

  return (
    <div className="max-w-6xl space-y-6">
      <Seitenkopf titel={t.navigation.kapitalabrufe} beschreibung={t.seiten.kapitalabrufe} />
      <Kacheln>
        <Kachel titel={tk.kacheln.offen} wert={f.betragGanz(summe((a) => a.stand.offen))} ton={ueberfaellig > 0 ? "warnung" : undefined} unter={ueberfaellig > 0 ? fuelle(tk.ueberfaelligAnzahl, { anzahl: ueberfaellig }) : undefined} />
        <Kachel titel={tk.kacheln.eingegangen} wert={f.betragGanz(summe((a) => a.stand.eingegangen))} unter={tk.kapitalkonto} />
        <Kachel titel={tk.kacheln.ueberfaellig} wert={ueberfaellig} ton={ueberfaellig > 0 ? "schlecht" : undefined} />
        <Kachel titel={tk.kacheln.abrufe} wert={abrufe.length} />
      </Kacheln>

      <Karte titel={tk.liste}>
        {abrufe.length === 0 ? (
          <Leer>{tk.keine}</Leer>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{tk.spalten.abruf}</th>
                <th>{tk.spalten.faellig}</th>
                <th className={rechts}>{tk.spalten.betrag}</th>
                <th className={rechts}>{tk.spalten.eingegangen}</th>
                <th className={rechts}>{tk.spalten.offen}</th>
                <th>{tk.spalten.status}</th>
              </tr>
            </thead>
            <tbody>
              {abrufe.map((a) => (
                <tr key={a.id} data-abruf={a.bezeichnung}>
                  <td>
                    <Link href={`/kapitalabrufe/${a.id}`} className="font-medium hover:underline">
                      {a.bezeichnung}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {a.gesellschaft} · {tk.abrufAm} {f.datum(a.abrufAm)}
                    </div>
                  </td>
                  <td className="whitespace-nowrap">{f.datum(a.faelligAm)}</td>
                  <td className={rechts}>{f.betragGanz(a.stand.betrag)}</td>
                  <td className={rechts}>
                    {f.betragGanz(a.stand.eingegangen)}
                    {a.stand.quote && <div className="text-xs text-slate-500">{f.prozent(a.stand.quote, 0)}</div>}
                  </td>
                  <td className={rechts}>{f.betragGanz(a.stand.offen)}</td>
                  <td>
                    <Marke ton={STATUS_TON[a.stand.status]}>{tk.status[a.stand.status]}</Marke>{" "}
                    {a.stand.ueberfaellig > 0 && <Marke ton="schlecht">{fuelle(tk.ueberfaelligAnzahl, { anzahl: a.stand.ueberfaellig })}</Marke>}
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabelle>
        )}
      </Karte>

      {schreiben && gesellschaften.length > 0 && (
        <Karte titel={tk.neu}>
          <p className="-mt-2 mb-3 text-sm text-slate-600">{tk.neuHinweis}</p>
          <Formular aktion={kapitalabrufAnlegen} absenden={tk.anlegen}>
            <Felder>
              <Auswahl name="gesellschaftId" label={tk.gesellschaft} optionen={gesellschaften.map((g) => ({ wert: g.id, text: g.name }))} pflicht />
              <Feld name="bezeichnung" label={tk.bezeichnung} platzhalter={tk.bezeichnungPlatzhalter} pflicht />
              <Feld name="gesamtbetrag" label={tk.gesamtbetrag} inputMode="decimal" pflicht />
              <Feld name="abrufAm" label={tk.abrufAm} typ="date" wert={heute()} pflicht />
              <Feld name="faelligAm" label={tk.faelligAm} typ="date" pflicht />
              <Textfeld name="notiz" label={t.allgemein.notiz} />
            </Felder>
          </Formular>
        </Karte>
      )}
      <p className="text-xs text-slate-500">
        <Begriff k="Kapitalsaldo" t={t} />: {tk.kapitalkonto}
      </p>
      <Glossar begriffe={["Kapitalsaldo", "NettoEinlagen"]} t={t} />
    </div>
  );
}
