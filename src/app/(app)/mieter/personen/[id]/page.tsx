import Link from "next/link";
import { Merken } from "@/components/merken";
import { notFound } from "next/navigation";
import { Formular } from "@/components/formular";
import { Angaben, Ankreuzfeld, Feld, Felder, Karte, KnopfLink, Leer, Marke, MieteZelle, Seitenkopf, Tabelle, Textfeld, rechts } from "@/components/ui";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { heute, isoDatum } from "@/lib/datum";
import { erlaubt } from "@/lib/daten/portfolio";
import { formatierer } from "@/lib/format";
import { mietStatus } from "@/lib/mietverhaeltnis";
import { mieterLoeschen, mieterSpeichern } from "../../aktionen";

export default async function MieterPersonSeite({ params }: PageProps<"/mieter/personen/[id]">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("mieter");
  const t = texte(kontext.mandant.sprache);
  const f = formatierer(kontext.mandant);
  const tm = t.mieter;
  const stichtag = heute();
  const sicht = await sichtbarkeit(kontext);
  const hausFilter = erlaubt(sicht.hausIds);

  const mieter = await kontext.db.mieter.findFirst({
    where: { id, ...(hausFilter ? { mietverhaeltnisse: { some: { einheit: { hausId: hausFilter } } } } : {}) },
    include: {
      mietverhaeltnisse: {
        where: hausFilter ? { einheit: { hausId: hausFilter } } : undefined,
        orderBy: { beginn: "desc" },
        include: { einheit: { select: { bezeichnung: true, haus: { select: { bezeichnung: true } } } } },
      },
    },
  });
  if (!mieter) notFound();
  const schreiben = darf(kontext.rolle, "mieter", "schreiben");

  return (
    <div className="max-w-5xl space-y-6">
      <Seitenkopf
        titel={mieter.name}
        beschreibung={mieter.istFirma ? tm.istFirma : undefined}
        zurueck={{ href: "/mieter", text: tm.titel }}
        aktionen={
          <>
            <Merken kontext={kontext} t={t} art="mieter" pfad={`/mieter/personen/${id}`} titel={mieter.name} />
            {schreiben && <KnopfLink href="/mieter/neu" art="primaer">{tm.neuesMietverhaeltnis}</KnopfLink>}
          </>
        }
      />

      <Karte titel={tm.mietverhaeltnisse}>
        {mieter.mietverhaeltnisse.length === 0 ? (
          <Leer>{t.allgemein.keineDaten}</Leer>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>
                  {tm.haus} / {tm.einheit}
                </th>
                <th>{tm.beginn}</th>
                <th>{tm.ende}</th>
                <th className={rechts}>{t.kennzahlen.sollMiete}</th>
                <th className={rechts}>{t.kennzahlen.istMiete}</th>
                <th>{tm.status}</th>
              </tr>
            </thead>
            <tbody>
              {mieter.mietverhaeltnisse.map((m) => {
                const status = mietStatus({ beginn: isoDatum(m.beginn), ende: isoDatum(m.ende) }, stichtag);
                return (
                  <tr key={m.id}>
                    <td>
                      <Link href={`/mieter/vertraege/${m.id}`} className="font-medium hover:underline">
                        {m.einheit.haus.bezeichnung} · {m.einheit.bezeichnung}
                      </Link>
                    </td>
                    <td>{f.datum(m.beginn)}</td>
                    <td>{f.datum(m.ende)}</td>
                    <td className={rechts}>
                      <MieteZelle monat={f.betrag(m.sollMiete)} jahr={f.jahresmiete(m.sollMiete)} />
                    </td>
                    <td className={rechts}>
                      <MieteZelle monat={f.betrag(m.istMiete)} jahr={f.jahresmiete(m.istMiete)} />
                    </td>
                    <td>
                      <Marke ton={status === "aktiv" ? "gut" : "neutral"}>{tm.statusArten[status]}</Marke>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Tabelle>
        )}
      </Karte>

      <Karte titel={tm.kontakt}>
        {schreiben ? (
          <Formular aktion={mieterSpeichern.bind(null, id)} absenden={t.allgemein.speichern}>
            <Felder>
              <Feld name="name" label={tm.name} wert={mieter.name} pflicht />
              <div className="flex items-end pb-2">
                <Ankreuzfeld name="istFirma" label={tm.istFirma} wert={mieter.istFirma} />
              </div>
              <Feld name="email" label={tm.email} typ="email" wert={mieter.email} />
              <Feld name="telefon" label={tm.telefon} wert={mieter.telefon} />
              <Textfeld name="notiz" label={t.allgemein.notiz} wert={mieter.notiz} />
            </Felder>
          </Formular>
        ) : (
          <Angaben
            eintraege={[
              [tm.email, mieter.email],
              [tm.telefon, mieter.telefon],
              [t.allgemein.notiz, mieter.notiz],
            ]}
          />
        )}
      </Karte>

      {schreiben && mieter.mietverhaeltnisse.length === 0 && (
        <Formular aktion={mieterLoeschen.bind(null, id)} absenden={t.allgemein.loeschen} art="gefahr" bestaetigen={t.allgemein.loeschenBestaetigen} />
      )}
    </div>
  );
}
