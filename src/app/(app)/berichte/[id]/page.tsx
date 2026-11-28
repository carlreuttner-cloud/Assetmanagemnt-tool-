import { notFound } from "next/navigation";
import { Formular } from "@/components/formular";
import { Begriff, Glossar } from "@/components/herleitung";
import { Feld, Karte, KnopfLink, Marke, Seitenkopf, Tabelle, Textfeld, rechts } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { sichtbarkeit } from "@/lib/auth/sichtbarkeit";
import { berichtFilter } from "@/lib/daten/quartalsbericht";
import { formatierer } from "@/lib/format";
import { darfFreigeben, type QuartalsberichtInhalt } from "@/lib/quartalsbericht";
import { berichtAbschnitte, type Ton } from "@/lib/quartalsbericht-ansicht";
import { berichtFreigeben, berichtVerwerfen, kommentarSpeichern } from "../aktionen";

const FARBE: Record<Ton, string> = { gut: "text-emerald-700", schlecht: "text-red-700", warnung: "text-amber-700" };

export default async function BerichtSeite({ params }: PageProps<"/berichte/[id]">) {
  const { id } = await params;
  const kontext = await pruefeZugriff("berichte");
  const sicht = await sichtbarkeit(kontext);
  const t = texte(kontext.mandant.sprache);
  const tq = t.quartalsbericht;
  const f = formatierer(kontext.mandant);
  const b = await kontext.db.quartalsbericht.findFirst({ where: { id, ...berichtFilter(kontext.rolle, sicht.gesellschaftIds) } });
  if (!b) notFound();
  const inhalt = b.inhalt as unknown as QuartalsberichtInhalt;
  const schreiben = darf(kontext.rolle, "berichte", "schreiben");
  const freigabe = darfFreigeben(b, kontext.benutzer.id);
  const titel = `${tq.titel} ${fuelle(tq.quartalWert, { quartal: b.quartal, jahr: b.jahr })}`;

  return (
    <div className="max-w-6xl space-y-6">
      <Seitenkopf
        titel={titel}
        beschreibung={`${inhalt.umfang.name} · ${tq.spaltenHaus.stand} ${f.datum(inhalt.stichtag)} · ${fuelle(tq.erstelltVon, { name: b.erstelltVonName, datum: f.datumZeit(b.erstelltAm) })}`}
        aktionen={
          <KnopfLink href={`/api/quartalsbericht/${b.id}`} art="sekundaer">
            {tq.pdf}
          </KnopfLink>
        }
      />

      <Karte>
        <div className="flex flex-wrap items-center gap-3" data-status={b.status}>
          <Marke ton={b.status === "FREIGEGEBEN" ? "gut" : b.status === "ENTWURF" ? "warnung" : "neutral"}>{tq.stati[b.status]}</Marke>
          <span className="text-sm text-slate-600">
            {b.status === "FREIGEGEBEN" && b.freigegebenAm
              ? fuelle(tq.freigegebenVon, { name: b.freigegebenVonName ?? "", datum: f.datumZeit(b.freigegebenAm) })
              : b.status === "VERWORFEN"
                ? fuelle(tq.verworfenHinweis, { grund: b.verworfenGrund ?? "" })
                : tq.entwurfHinweis}
          </span>
          <Begriff k="VierAugen" t={t} />
        </div>
        {schreiben && b.status === "ENTWURF" && (
          <div className="mt-4 flex flex-wrap items-start gap-6">
            {freigabe === "ja" ? (
              <Formular aktion={berichtFreigeben.bind(null, b.id)} absenden={tq.freigeben} bestaetigen={tq.freigebenFrage} />
            ) : (
              <p className="max-w-md text-sm text-amber-700" data-selbst-freigabe>
                {tq.selbstFreigabe}
              </p>
            )}
            <details>
              <summary className="cursor-pointer text-sm text-red-700">{tq.verwerfen}</summary>
              <Formular aktion={berichtVerwerfen.bind(null, b.id)} absenden={tq.verwerfen} art="gefahr" className="mt-2">
                <Feld name="grund" label={tq.verwerfenGrund} pflicht />
              </Formular>
            </details>
          </div>
        )}
      </Karte>

      {berichtAbschnitte(inhalt, t, f, b.kommentar).map((a) => (
        <Karte key={a.titel} titel={a.titel}>
          {a.titel === tq.abschnitte.kommentar && schreiben && b.status === "ENTWURF" ? (
            <Formular aktion={kommentarSpeichern.bind(null, b.id)} absenden={tq.kommentarSpeichern}>
              <Textfeld name="kommentar" label={tq.kommentar} wert={b.kommentar ?? undefined} />
            </Formular>
          ) : (
            <>
              {a.spalten && a.zeilen && (
                <Tabelle>
                  <thead>
                    <tr>
                      {a.spalten.map((s, i) => (
                        <th key={i} className={s.rechts ? rechts : undefined}>
                          {s.titel}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {a.zeilen.map((z, i) => (
                      <tr key={i}>
                        {z.map((c, j) => (
                          <td key={j} className={`${a.spalten![j]?.rechts ? rechts : ""} ${c.ton ? FARBE[c.ton] : ""} ${c.fett ? "font-medium" : ""}`}>
                            {c.text}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </Tabelle>
              )}
              {a.texte?.map((x, i) => (
                <p key={i} className={`mt-2 text-sm ${x.ton ? FARBE[x.ton] : "text-slate-600"}`}>
                  {x.text}
                </p>
              ))}
            </>
          )}
        </Karte>
      ))}

      <Glossar begriffe={["VierAugen", "JNKM", "LTV", "DSCR", "ICR"]} t={t} />
    </div>
  );
}
