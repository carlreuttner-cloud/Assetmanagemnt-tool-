import Link from "next/link";
import { notFound } from "next/navigation";
import { Formular } from "@/components/formular";
import { Angaben, Feld, Felder, Kachel, Kacheln, Karte, KnopfLink, Leer, Marke, Seitenkopf } from "@/components/ui";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { heute, isoDatum } from "@/lib/datum";
import { erlaubt } from "@/lib/daten/portfolio";
import { dezimal } from "@/lib/geld";
import { formatierer } from "@/lib/format";
import { mietStatus, monateSeitErhoehung } from "@/lib/mietverhaeltnis";
import { mieterhoehungErfassen, mietverhaeltnisBeenden } from "../../aktionen";

/** Felder, die im Änderungsverlauf angezeigt werden, und wie. */
const VERLAUF_FELDER = ["sollMiete", "istMiete", "beginn", "ende", "letzteMieterhoehung", "rueckstand", "rueckstandStichtag"] as const;

export default async function MietverhaeltnisSeite({ params }: PageProps<"/mieter/vertraege/[id]">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("mieter");
  const t = texte(kontext.mandant.sprache);
  const f = formatierer(kontext.mandant);
  const tm = t.mieter;
  const stichtag = heute();
  const sicht = await sichtbarkeit(kontext);

  const mv = await kontext.db.mietverhaeltnis.findFirst({
    where: { id, einheit: { hausId: erlaubt(sicht.hausIds) } },
    include: {
      mieter: true,
      einheit: { include: { haus: { select: { id: true, bezeichnung: true } } } },
    },
  });
  if (!mv) notFound();
  const verlauf = await kontext.db.aenderungsprotokoll.findMany({
    where: { tabelle: "Mietverhaeltnis", datensatzId: id },
    orderBy: { zeitpunkt: "desc" },
    include: { benutzer: { select: { name: true } } },
    take: 50,
  });

  const beginn = isoDatum(mv.beginn);
  const ende = isoDatum(mv.ende);
  const status = mietStatus({ beginn, ende }, stichtag);
  const soll = dezimal(mv.sollMiete);
  const ist = dezimal(mv.istMiete);
  const rueckstand = dezimal(mv.rueckstand);
  const schreiben = darf(kontext.rolle, "mieter", "schreiben");
  const darfHaeuser = darf(kontext.rolle, "haeuser");
  const tk = t.kennzahlen;

  const feldName: Record<(typeof VERLAUF_FELDER)[number], string> = {
    sollMiete: tm.sollMiete,
    istMiete: tm.istMiete,
    beginn: tm.beginn,
    ende: tm.ende,
    letzteMieterhoehung: tm.letzteMieterhoehung,
    rueckstand: tm.rueckstand,
    rueckstandStichtag: tm.rueckstandStichtag,
  };
  const wertText = (feld: string, wert: unknown) => {
    if (wert === null || wert === undefined) return "–";
    if (typeof wert === "string" && /^\d{4}-\d{2}-\d{2}T/.test(wert)) return f.datum(wert.slice(0, 10));
    if (["sollMiete", "istMiete", "rueckstand"].includes(feld)) return f.betrag(String(wert));
    return String(wert);
  };

  return (
    <div className="space-y-6">
      <Seitenkopf
        titel={
          <>
            {mv.mieter.name} <Marke ton={status === "aktiv" ? "gut" : "neutral"}>{tm.statusArten[status]}</Marke>
          </>
        }
        beschreibung={
          <>
            {darfHaeuser ? (
              <Link href={`/haeuser/${mv.einheit.haus.id}`} className="hover:underline">
                {mv.einheit.haus.bezeichnung}
              </Link>
            ) : (
              mv.einheit.haus.bezeichnung
            )}
            {` · ${mv.einheit.bezeichnung} (${t.einheitArten[mv.einheit.art]}, ${f.flaeche(mv.einheit.flaeche)})`}
          </>
        }
        zurueck={{ href: "/mieter", text: tm.titel }}
        aktionen={
          <>
            <KnopfLink href={`/mieter/personen/${mv.mieter.id}`}>{tm.mieter}</KnopfLink>
            {schreiben && <KnopfLink href={`/mieter/vertraege/${id}/bearbeiten`}>{t.allgemein.bearbeiten}</KnopfLink>}
          </>
        }
      />

      <Kacheln>
        <Kachel titel={tk.sollMieteMonat} wert={f.betrag(soll)} unter={`${tk.sollMieteJahr}: ${f.jahresmiete(soll)}`} />
        <Kachel
          titel={tk.istMieteMonat}
          wert={f.betrag(ist)}
          unter={`${tk.istMieteJahr}: ${f.jahresmiete(ist)} · ${tm.differenz}: ${f.betrag(ist.minus(soll))}`}
          ton={ist.lessThan(soll) ? "warnung" : undefined}
        />
        <Kachel
          titel={tm.rueckstand}
          wert={f.betrag(rueckstand)}
          unter={mv.rueckstandStichtag ? `${tm.rueckstandStichtag} ${f.datum(mv.rueckstandStichtag)}` : undefined}
          ton={rueckstand.greaterThan(0) ? "schlecht" : undefined}
        />
        <Kachel
          titel={tm.monateSeitErhoehung}
          wert={monateSeitErhoehung({ beginn, letzteMieterhoehung: isoDatum(mv.letzteMieterhoehung) }, stichtag)}
          unter={`${tm.letzteMieterhoehung}: ${f.datum(mv.letzteMieterhoehung)}`}
        />
      </Kacheln>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Karte titel={tm.vertragsdaten}>
          <Angaben
            eintraege={[
              [tm.beginn, f.datum(mv.beginn)],
              [tm.ende, f.datum(mv.ende)],
              [tm.sollMiete, `${f.betrag(soll)} (${t.allgemein.jahr} ${f.jahresmiete(soll)})`],
              [tm.istMiete, `${f.betrag(ist)} (${t.allgemein.jahr} ${f.jahresmiete(ist)})`],
              [tm.letzteMieterhoehung, f.datum(mv.letzteMieterhoehung)],
              [tm.rueckstand, f.betrag(rueckstand)],
              [t.allgemein.notiz, mv.notiz],
            ]}
          />
        </Karte>

        {schreiben && status !== "beendet" && (
          <div className="space-y-6">
            <Karte titel={tm.mieterhoehung}>
              <p className="mb-3 text-xs text-slate-500">{tm.mieterhoehungHinweis}</p>
              <Formular aktion={mieterhoehungErfassen.bind(null, id)} absenden={t.allgemein.speichern}>
                <Felder>
                  <Feld name="datum" label={tm.wirksamAb} typ="date" wert={stichtag} pflicht />
                  <Feld name="sollMiete" label={tm.neueSollMiete} wert={f.eingabe(soll, 2)} inputMode="decimal" pflicht />
                  <Feld name="istMiete" label={tm.neueIstMiete} inputMode="decimal" />
                </Felder>
              </Formular>
            </Karte>
            <Karte titel={tm.beenden}>
              <p className="mb-3 text-xs text-slate-500">{tm.beendenHinweis}</p>
              <Formular aktion={mietverhaeltnisBeenden.bind(null, id)} absenden={tm.beenden} art="gefahr" bestaetigen={tm.beendenHinweis}>
                <Felder>
                  <Feld name="ende" label={tm.ende} typ="date" wert={ende ?? stichtag} pflicht />
                </Felder>
              </Formular>
            </Karte>
          </div>
        )}
      </div>

      <Karte titel={tm.verlauf}>
        {verlauf.length === 0 ? (
          <Leer>{tm.keinVerlauf}</Leer>
        ) : (
          <ul className="space-y-3 text-sm">
            {verlauf.map((v) => {
              const alt = (v.alteWerte ?? {}) as Record<string, unknown>;
              const neu = (v.neueWerte ?? {}) as Record<string, unknown>;
              const geaendert = VERLAUF_FELDER.filter((feld) => v.aktion === "GEAENDERT" && JSON.stringify(alt[feld]) !== JSON.stringify(neu[feld]));
              return (
                <li key={v.id} className="border-l-2 border-slate-200 pl-3">
                  <div className="text-xs text-slate-500">
                    {new Intl.DateTimeFormat(f.sprache, { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(v.zeitpunkt)}
                    {" · "}
                    {v.benutzer?.name ?? "System"} · {tm.aenderungen[v.aktion]}
                  </div>
                  {geaendert.length > 0 && (
                    <ul className="mt-1">
                      {geaendert.map((feld) => (
                        <li key={feld}>
                          {feldName[feld]}: <span className="text-slate-500 line-through">{wertText(feld, alt[feld])}</span> → {wertText(feld, neu[feld])}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Karte>
    </div>
  );
}
