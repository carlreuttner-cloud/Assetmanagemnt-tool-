import { Formular } from "@/components/formular";
import { Feld, Felder, Karte, Leer, Seitenkopf, Tabelle, rechts } from "@/components/ui";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { heute } from "@/lib/datum";
import { formatierer } from "@/lib/format";
import { referenzzinsLoeschen, referenzzinsSpeichern } from "../aktionen";

export default async function ReferenzzinsenSeite() {
  const kontext = await pruefeZugriff("gesellschaften");
  const t = texte(kontext.mandant.sprache);
  const f = formatierer(kontext.mandant);
  const r = t.referenzzinsen;
  const schreiben = darf(kontext.rolle, "gesellschaften", "schreiben");
  const werte = await kontext.db.referenzzinssatz.findMany({ orderBy: [{ stichtag: "desc" }, { referenz: "asc" }] });
  const aktuell = [...new Set(werte.map((w) => w.referenz))].sort().map((ref) => werte.find((w) => w.referenz === ref)!);

  return (
    <div className="max-w-4xl space-y-6">
      <Seitenkopf titel={r.titel} beschreibung={r.beschreibung} zurueck={{ href: "/gesellschaften", text: t.gesellschaften.titel }} />

      <Karte titel={r.aktuell}>
        {aktuell.length === 0 ? (
          <Leer>{t.allgemein.keineDaten}</Leer>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{r.referenz}</th>
                <th>{t.allgemein.stichtag}</th>
                <th className={rechts}>{r.satz}</th>
                <th>{r.quelle}</th>
              </tr>
            </thead>
            <tbody>
              {aktuell.map((w) => (
                <tr key={w.id}>
                  <td className="font-medium">{w.referenz}</td>
                  <td>{f.datum(w.stichtag)}</td>
                  <td className={rechts}>{f.prozent(w.satz, 3)}</td>
                  <td className="text-slate-500">{w.quelle}</td>
                </tr>
              ))}
            </tbody>
          </Tabelle>
        )}
      </Karte>

      {schreiben && (
        <Karte titel={r.neu}>
          <Formular aktion={referenzzinsSpeichern} absenden={t.allgemein.speichern}>
            <Felder>
              <Feld name="referenz" label={r.referenz} platzhalter="3M-EURIBOR" pflicht />
              <Feld name="stichtag" label={t.allgemein.stichtag} typ="date" wert={heute()} pflicht />
              <Feld name="satz" label={r.satz} inputMode="decimal" pflicht />
              <Feld name="quelle" label={r.quelle} />
            </Felder>
          </Formular>
        </Karte>
      )}

      <Karte titel={r.verlauf}>
        <div className="max-h-[28rem] overflow-y-auto">
          <Tabelle>
            <thead className="sticky top-0 bg-white">
              <tr>
                <th>{t.allgemein.stichtag}</th>
                <th>{r.referenz}</th>
                <th className={rechts}>{r.satz}</th>
                <th>{r.quelle}</th>
                {schreiben && <th />}
              </tr>
            </thead>
            <tbody>
              {werte.map((w) => (
                <tr key={w.id}>
                  <td className="tabular-nums">{f.datum(w.stichtag)}</td>
                  <td>{w.referenz}</td>
                  <td className={rechts}>{f.prozent(w.satz, 3)}</td>
                  <td className="text-slate-500">{w.quelle}</td>
                  {schreiben && (
                    <td className="text-right">
                      <Formular aktion={referenzzinsLoeschen.bind(null, w.id)} absenden={t.allgemein.loeschen} art="gefahr" bestaetigen={t.allgemein.loeschenBestaetigen} inline />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </Tabelle>
        </div>
      </Karte>
    </div>
  );
}
