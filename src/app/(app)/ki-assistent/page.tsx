import Link from "next/link";
import { Formular } from "@/components/formular";
import { Auswahl, Feld, Felder, Karte, Leer, Marke, Seitenkopf, Tabelle, knopfKlasse, rechts } from "@/components/ui";
import { texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { erlaubt } from "@/lib/daten/portfolio";
import { formatierer } from "@/lib/format";
import type { GeprueftesErgebnis } from "@/lib/ki-analyse";
import { kiModus } from "@/lib/ki-claude";
import { analyseStarten } from "./aktionen";
import { zeitpunkt } from "./ki-bausteine";

export default async function KiAnalyseSeite() {
  const kontext = await pruefeZugriff("kiAssistent");
  const t = texte(kontext.mandant.sprache);
  const f = formatierer(kontext.mandant);
  const tk = t.ki;
  const sicht = await sichtbarkeit(kontext);
  const schreiben = darf(kontext.rolle, "kiAssistent", "schreiben");
  const modus = kiModus();

  const [gesellschaften, analysen] = await Promise.all([
    kontext.db.gesellschaft.findMany({ where: { id: erlaubt(sicht.gesellschaftIds) }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    kontext.db.kiAnalyse.findMany({
      where: { gesellschaftId: erlaubt(sicht.gesellschaftIds) },
      orderBy: { erstelltAm: "desc" },
      take: 50,
      select: {
        id: true,
        erstelltAm: true,
        stichtag: true,
        status: true,
        modell: true,
        schwerpunkt: true,
        ergebnis: true,
        gesellschaft: { select: { name: true } },
        benutzer: { select: { name: true } },
      },
    }),
  ]);
  const optionen = gesellschaften.map((g) => ({ wert: g.id, text: g.name }));

  return (
    <div className="max-w-5xl space-y-6">
      <Seitenkopf titel={tk.titel} beschreibung={tk.beschreibung} />

      <Karte titel={tk.grundsaetze}>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
          {Object.values(tk.grundsatzListe).map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </Karte>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {schreiben && (
          <Karte titel={tk.starten}>
            {modus === "demo" && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{tk.demo.hinweis}</p>}
            {modus === "aus" ? (
              <p className="text-sm text-amber-800">{tk.nichtKonfiguriert}</p>
            ) : gesellschaften.length === 0 ? (
              <Leer>{tk.keineGesellschaften}</Leer>
            ) : (
              <Formular aktion={analyseStarten} absenden={tk.starten} bestaetigen={modus === "claude" ? tk.startenBestaetigen : undefined} laeuftText={tk.laeuft}>
                <Felder>
                  <Auswahl name="gesellschaftId" label={tk.gesellschaft} optionen={optionen} pflicht />
                  <Feld name="schwerpunkt" label={tk.schwerpunkt} hinweis={tk.schwerpunktHinweis} />
                </Felder>
              </Formular>
            )}
          </Karte>
        )}
        <Karte titel={tk.datenpaketAnsehen}>
          {gesellschaften.length === 0 ? (
            <Leer>{tk.keineGesellschaften}</Leer>
          ) : (
            <form method="get" action="/ki-assistent/datenpaket" className="space-y-4">
              <Auswahl name="g" label={tk.gesellschaft} optionen={optionen} pflicht />
              <button type="submit" className={knopfKlasse("sekundaer")}>
                {tk.datenpaketAnsehen}
              </button>
            </form>
          )}
        </Karte>
      </div>

      <Karte titel={tk.verlauf}>
        {analysen.length === 0 ? (
          <Leer>{tk.keinVerlauf}</Leer>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{tk.zeitpunkt}</th>
                <th>{tk.gesellschaft}</th>
                <th>{tk.stichtag}</th>
                <th>{tk.status}</th>
                <th className={rechts}>{tk.aussagenZahl}</th>
                <th className={rechts}>{tk.ohneBelegZahl}</th>
                <th>{tk.benutzer}</th>
              </tr>
            </thead>
            <tbody>
              {analysen.map((a) => {
                const e = a.ergebnis as unknown as GeprueftesErgebnis | null;
                return (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap">
                      <Link href={`/ki-assistent/${a.id}`} className="font-medium hover:underline">
                        {zeitpunkt(a.erstelltAm, f.sprache)}
                      </Link>
                    </td>
                    <td>
                      {a.gesellschaft.name}
                      {a.schwerpunkt && <div className="text-xs text-slate-500">{a.schwerpunkt}</div>}
                    </td>
                    <td>{f.datum(a.stichtag)}</td>
                    <td>
                      <Marke ton={a.status === "ERFOLGREICH" ? "gut" : "schlecht"}>{tk.stati[a.status]}</Marke>
                    </td>
                    <td className={rechts}>{e ? e.aussagen.length : "–"}</td>
                    <td className={rechts}>{e ? e.pruefung.ohneBeleg : "–"}</td>
                    <td>{a.benutzer?.name ?? "–"}</td>
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
