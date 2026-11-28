import Link from "next/link";
import { Formular } from "@/components/formular";
import { Karte, Leer, Marke, Seitenkopf, Tabelle, rechts } from "@/components/ui";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { KI_FRAGE_MAX, type GepruefteAntwort } from "@/lib/ki-antwort";
import { kiModus } from "@/lib/ki-claude";
import { zeitpunkt } from "../ki-assistent/ki-bausteine";
import { frageStellen } from "./aktionen";

export default async function KiFragenSeite({ searchParams }: PageProps<"/ki-fragen">) {
  const kontext = await pruefeZugriff("kiAssistent");
  await sichtbarkeit(kontext);
  const sp = await searchParams;
  const t = texte(kontext.mandant.sprache);
  const tf = t.kiFragen;
  const schreiben = darf(kontext.rolle, "kiAssistent", "schreiben");
  const modus = kiModus();
  const vorgabe = typeof sp.frage === "string" ? sp.frage.slice(0, KI_FRAGE_MAX) : "";

  const fragen = await kontext.db.kiFrage.findMany({
    where: { benutzerId: kontext.benutzer.id },
    orderBy: { erstelltAm: "desc" },
    take: 50,
    select: { id: true, frage: true, erstelltAm: true, status: true, antwort: true },
  });

  return (
    <div className="max-w-5xl space-y-6">
      <Seitenkopf titel={tf.titel} beschreibung={tf.beschreibung} />

      {schreiben && (
        <Karte titel={tf.fragen}>
          {modus === "demo" && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{tf.demo.hinweis}</p>}
          {modus === "aus" ? (
            <p className="text-sm text-amber-800">{t.ki.nichtKonfiguriert}</p>
          ) : (
            <Formular aktion={frageStellen} absenden={tf.fragen} bestaetigen={modus === "claude" ? tf.fragenBestaetigen : undefined} laeuftText={tf.laeuft}>
              <label className="block text-sm">
                <span className="font-medium text-slate-700">{tf.frage}</span>
                <textarea
                  key={vorgabe}
                  name="frage"
                  required
                  maxLength={KI_FRAGE_MAX}
                  defaultValue={vorgabe}
                  rows={3}
                  className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                />
                <span className="mt-1 block text-xs text-slate-500">{tf.frageHinweis}</span>
              </label>
            </Formular>
          )}
          <div className="mt-4">
            <p className="text-xs font-medium text-slate-500">{tf.beispiele}</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {Object.values(tf.beispielListe).map((b) => (
                <Link key={b} href={`/ki-fragen?frage=${encodeURIComponent(b)}`} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100" data-beispiel>
                  {b}
                </Link>
              ))}
            </div>
          </div>
        </Karte>
      )}

      <Karte titel={tf.grundsaetze}>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          {Object.values(tf.grundsatzListe).map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </Karte>

      <Karte titel={tf.verlauf}>
        <p className="mb-3 text-xs text-slate-500">{tf.nurEigene}</p>
        {fragen.length === 0 ? (
          <Leer>{tf.keinVerlauf}</Leer>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{tf.zeitpunkt}</th>
                <th>{tf.frage}</th>
                <th>{tf.status}</th>
                <th className={rechts}>{tf.bausteineZahl}</th>
              </tr>
            </thead>
            <tbody>
              {fragen.map((x) => {
                const a = x.antwort as unknown as GepruefteAntwort | null;
                return (
                  <tr key={x.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap">
                      <Link href={`/ki-fragen/${x.id}`} className="font-medium hover:underline">
                        {zeitpunkt(x.erstelltAm, kontext.mandant.sprache)}
                      </Link>
                    </td>
                    <td className="max-w-md truncate" title={x.frage}>
                      {x.frage}
                    </td>
                    <td>
                      <Marke ton={x.status === "ERFOLGREICH" ? "gut" : "schlecht"}>{t.ki.stati[x.status]}</Marke>
                    </td>
                    <td className={rechts}>{a ? a.bausteine.length : "–"}</td>
                  </tr>
                );
              })}
            </tbody>
          </Tabelle>
        )}
      </Karte>
    </div>
  );
}
