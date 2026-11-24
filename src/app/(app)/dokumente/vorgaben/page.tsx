import { Formular } from "@/components/formular";
import { Auswahl, Feld, Felder, Karte, Leer, Marke, Seitenkopf, Tabelle } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import type { Bezug } from "@/lib/dokumente";
import { standardVorgabenAnlegen, vorgabeLoeschen, vorgabeSpeichern, vorgabeUmschalten } from "../aktionen";

export default async function VorgabenSeite() {
  const kontext = await pruefeZugriff("dokumente", "schreiben");
  const t = texte(kontext.mandant.sprache);
  const td = t.dokumente;
  const vorgaben = await kontext.db.dokumentvorgabe.findMany({
    orderBy: [{ bezug: "asc" }, { reihenfolge: "asc" }, { name: "asc" }],
    include: { _count: { select: { nachweise: true } } },
  });
  const bezuege: Bezug[] = ["GESELLSCHAFT", "HAUS", "KREDIT"];

  return (
    <div className="max-w-5xl space-y-6">
      <Seitenkopf titel={td.vorgaben} beschreibung={td.vorgabenBeschreibung} zurueck={{ href: "/dokumente", text: td.titel }} />

      {vorgaben.length === 0 && (
        <Karte>
          <Leer>{td.keineVorgaben}</Leer>
        </Karte>
      )}

      {bezuege.map((bezug) => {
        const liste = vorgaben.filter((v) => v.bezug === bezug);
        if (liste.length === 0) return null;
        return (
          <Karte key={bezug} titel={td.bezuege[bezug]}>
            <Tabelle>
              <thead>
                <tr>
                  <th>{td.name}</th>
                  <th>{td.gueltigMonate}</th>
                  <th>{td.automatik}</th>
                  <th>{td.status}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {liste.map((v) => (
                  <tr key={v.id} className={v.aktiv ? undefined : "text-slate-400"}>
                    <td>
                      <div className="font-medium">{v.name}</div>
                      {v.beschreibung && <div className="text-xs text-slate-500">{v.beschreibung}</div>}
                    </td>
                    <td>{v.gueltigMonate === null ? td.unbegrenzt : fuelle(td.monate, { anzahl: v.gueltigMonate })}</td>
                    <td>{v.automatik ? td.automatiken[v.automatik] : td.automatikKeine}</td>
                    <td>{v.aktiv ? <Marke ton="gut">{td.aktiv}</Marke> : <Marke>{td.inaktiv}</Marke>}</td>
                    <td className="space-x-2 whitespace-nowrap text-right">
                      <Formular aktion={vorgabeUmschalten.bind(null, v.id)} absenden={v.aktiv ? td.ausblenden : td.einblenden} art="sekundaer" inline />
                      {v._count.nachweise === 0 && (
                        <Formular aktion={vorgabeLoeschen.bind(null, v.id)} absenden={t.allgemein.loeschen} art="gefahr" bestaetigen={t.allgemein.loeschenBestaetigen} inline />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Tabelle>
          </Karte>
        );
      })}

      <Karte titel={t.allgemein.hinzufuegen}>
        <Formular aktion={vorgabeSpeichern} absenden={t.allgemein.speichern} zuruecksetzen>
          <Felder>
            <Feld name="name" label={td.name} pflicht />
            <Auswahl name="bezug" label={td.bezug} optionen={bezuege.map((b) => ({ wert: b, text: td.bezuege[b] }))} pflicht />
            <Feld name="gueltigMonate" label={td.gueltigMonate} inputMode="numeric" hinweis={td.gueltigMonateHinweis} />
            <Auswahl
              name="automatik"
              label={td.automatik}
              leerText={td.automatikKeine}
              optionen={(["GUTACHTEN", "JAHRESABSCHLUSS", "SALDENBESTAETIGUNG"] as const).map((a) => ({ wert: a, text: td.automatiken[a] }))}
              hinweis={td.automatikHinweis}
            />
            <Feld name="beschreibung" label={td.beschreibungFeld} breit />
          </Felder>
        </Formular>
      </Karte>

      <Karte>
        <Formular aktion={standardVorgabenAnlegen} absenden={td.standardUebernehmen} art="sekundaer" />
      </Karte>
    </div>
  );
}
