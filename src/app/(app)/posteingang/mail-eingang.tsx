import { Formular } from "@/components/formular";
import { Auswahl, Feld, Felder, Karte, Leer, Marke, Tabelle, rechts } from "@/components/ui";
import { fuelle, type Texte } from "@/i18n";
import { ABSENDER_ARTEN } from "@/lib/dokument-vorschlag";
import type { Formatierer } from "@/lib/format";
import { MAX_ANHAENGE, mailDomain, mailHinweise } from "@/lib/mail-eingang";
import { mailAbsenderAnlegen, mailAbsenderLoeschen, postfachErneuern, postfachSchalten } from "./aktionen";

type Art = (typeof ABSENDER_ARTEN)[number];
type Ergebnis = "AUFGENOMMEN" | "QUARANTAENE" | "OHNE_ANHANG" | "DOPPELT" | "FEHLER";

/** Import-Adresse, bekannte Absender und Protokoll der empfangenen Mails. */
export function MailEingang({
  postfach,
  absender,
  mails,
  t,
  f,
}: {
  postfach: { kennung: string; aktiv: boolean } | null;
  absender: Array<{ id: string; adresse: string; name: string | null; absenderArt: Art | null }>;
  mails: Array<{ id: string; von: string; vonName: string | null; betreff: string | null; ergebnis: Ergebnis; hinweis: string | null; pruefung: string | null; anzahlAnhaenge: number; aufgenommen: number; empfangenAm: Date }>;
  t: Texte;
  f: Formatierer;
}) {
  const tm = t.mailEingang;
  const ton = { AUFGENOMMEN: "gut", QUARANTAENE: "warnung", OHNE_ANHANG: "neutral", DOPPELT: "neutral", FEHLER: "schlecht" } as const;
  return (
    <Karte titel={tm.titel}>
      <p className="mb-4 text-sm text-slate-600">{fuelle(tm.beschreibung, { max: MAX_ANHAENGE })}</p>

      <div className="mb-6 rounded-lg border border-slate-200 p-4" data-postfach>
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{tm.adresseTitel}</div>
        {postfach ? (
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <code className="rounded bg-slate-100 px-2 py-1 text-sm" data-import-adresse>
              {postfach.kennung}@{mailDomain()}
            </code>
            <Marke ton={postfach.aktiv ? "gut" : "neutral"}>{postfach.aktiv ? tm.aktiv : tm.inaktiv}</Marke>
            <Formular aktion={postfachSchalten.bind(null, !postfach.aktiv)} absenden={postfach.aktiv ? tm.pausieren : tm.aktivieren} inline />
            <Formular aktion={postfachErneuern} absenden={tm.erneuern} bestaetigen={tm.erneuernBestaetigen} inline />
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="text-sm text-slate-500">{tm.keinePostfach}</span>
            <Formular aktion={postfachErneuern} absenden={tm.anlegenPostfach} className="" />
          </div>
        )}
        <p className="mt-2 text-xs text-slate-500">{tm.lokalHinweis}</p>
      </div>

      <h3 className="mb-1 text-sm font-semibold text-slate-800">{tm.absenderTitel}</h3>
      <p className="mb-3 text-sm text-slate-600">{tm.absenderBeschreibung}</p>
      {absender.length === 0 ? (
        <Leer>{tm.keineAbsender}</Leer>
      ) : (
        <Tabelle>
          <thead>
            <tr>
              <th>{tm.adresse}</th>
              <th>{tm.name}</th>
              <th>{t.dateien.absender}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {absender.map((a) => (
              <tr key={a.id} data-mail-absender={a.adresse}>
                <td className="font-mono text-xs">{a.adresse}</td>
                <td>{a.name ?? "–"}</td>
                <td>{a.absenderArt ? t.dateien.absenderArten[a.absenderArt] : "–"}</td>
                <td className={rechts}>
                  <Formular aktion={mailAbsenderLoeschen.bind(null, a.id)} absenden={tm.loeschen} inline />
                </td>
              </tr>
            ))}
          </tbody>
        </Tabelle>
      )}
      <details className="mt-3" data-mail-absender-anlegen>
        <summary className="cursor-pointer text-sm font-medium text-sky-700">{tm.hinzufuegen}</summary>
        <div className="mt-3">
          <Formular aktion={mailAbsenderAnlegen} absenden={tm.hinzufuegen} zuruecksetzen>
            <Felder>
              <Feld name="adresse" label={tm.adresse} platzhalter={tm.adresseBeispiel} pflicht />
              <Feld name="name" label={tm.name} />
              <Auswahl name="absenderArt" label={t.dateien.absender} leerText={t.dateien.keinAbsender} optionen={ABSENDER_ARTEN.map((a) => ({ wert: a, text: t.dateien.absenderArten[a] }))} />
            </Felder>
          </Formular>
        </div>
      </details>

      <h3 className="mb-2 mt-6 text-sm font-semibold text-slate-800">{tm.protokollTitel}</h3>
      {mails.length === 0 ? (
        <Leer>{tm.protokollLeer}</Leer>
      ) : (
        <Tabelle>
          <thead>
            <tr>
              <th>{tm.spalten.empfangen}</th>
              <th>{tm.spalten.von}</th>
              <th>{tm.spalten.betreff}</th>
              <th>{tm.spalten.ergebnis}</th>
              <th>{tm.spalten.anhaenge}</th>
              <th>{tm.spalten.hinweise}</th>
            </tr>
          </thead>
          <tbody>
            {mails.map((m) => (
              <tr key={m.id} data-mail={m.ergebnis}>
                <td className="whitespace-nowrap">{f.datumZeit(m.empfangenAm)}</td>
                <td>
                  {m.vonName ?? m.von}
                  {m.vonName && <div className="text-xs text-slate-500">{m.von}</div>}
                </td>
                <td>{m.betreff ?? "–"}</td>
                <td>
                  <Marke ton={ton[m.ergebnis]}>{tm.ergebnisse[m.ergebnis]}</Marke>
                </td>
                <td>{m.anzahlAnhaenge === 0 ? "–" : fuelle(tm.anhaengeWert, { aufgenommen: m.aufgenommen, anzahl: m.anzahlAnhaenge })}</td>
                <td className="text-xs text-slate-600">
                  {[...mailHinweise(m.hinweis).map((h) => tm.hinweise[h as keyof typeof tm.hinweise] ?? h), m.pruefung ? fuelle(tm.pruefungText, { text: m.pruefung }) : null].filter(Boolean).join(" · ") || "–"}
                </td>
              </tr>
            ))}
          </tbody>
        </Tabelle>
      )}
    </Karte>
  );
}
