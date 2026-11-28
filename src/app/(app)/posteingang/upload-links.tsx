import { Formular } from "@/components/formular";
import { Auswahl, Feld, Felder, Karte, Leer, Marke, Tabelle, rechts } from "@/components/ui";
import { fuelle, type Texte } from "@/i18n";
import { ABSENDER_ARTEN } from "@/lib/dokument-vorschlag";
import type { Formatierer } from "@/lib/format";
import { MAX_DATEIEN_JE_LINK, MAX_GUELTIG_TAGE, linkStatus } from "@/lib/upload-link";
import { uploadLinkAnlegen, uploadLinkWiderrufen } from "./aktionen";

type Link = {
  id: string;
  name: string;
  absenderArt: (typeof ABSENDER_ARTEN)[number] | null;
  schluesselEnde: string;
  gueltigBis: Date;
  widerrufenAm: Date | null;
  zuletztGenutzt: Date | null;
  anzahlDateien: number;
  erstelltAm: Date;
};

/** Verwaltung der Upload-Links im Posteingang: anlegen, Nutzung sehen, widerrufen. */
export function UploadLinks({ links, t, f }: { links: Link[]; t: Texte; f: Formatierer }) {
  const tu = t.uploadLink;
  const ton = { aktiv: "gut", abgelaufen: "neutral", widerrufen: "neutral", voll: "warnung" } as const;
  return (
    <Karte titel={tu.titel}>
      <p className="mb-4 text-sm text-slate-600">{fuelle(tu.beschreibung, { max: MAX_DATEIEN_JE_LINK })}</p>
      <details className="mb-4" data-link-anlegen>
        <summary className="cursor-pointer text-sm font-medium text-sky-700">{tu.neu}</summary>
        <div className="mt-3">
          <Formular aktion={uploadLinkAnlegen} absenden={tu.anlegen} zuruecksetzen>
            <Felder>
              <Feld name="name" label={tu.name} platzhalter={tu.nameBeispiel} pflicht />
              <Auswahl name="absenderArt" label={t.dateien.absender} leerText={t.dateien.keinAbsender} optionen={ABSENDER_ARTEN.map((a) => ({ wert: a, text: t.dateien.absenderArten[a] }))} hinweis={tu.absenderHinweis} />
              <Feld name="tage" label={tu.tage} typ="number" wert="30" inputMode="numeric" hinweis={fuelle(tu.tageHinweis, { max: MAX_GUELTIG_TAGE })} pflicht />
            </Felder>
          </Formular>
        </div>
      </details>
      {links.length === 0 ? (
        <Leer>{tu.keine}</Leer>
      ) : (
        <Tabelle>
          <thead>
            <tr>
              <th>{tu.name}</th>
              <th>{t.dateien.absender}</th>
              <th>{tu.status}</th>
              <th>{tu.gueltig}</th>
              <th className={rechts}>{tu.dateien}</th>
              <th>{tu.zuletzt}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {links.map((l) => {
              const s = linkStatus(l);
              return (
                <tr key={l.id} data-upload-link={s}>
                  <td>
                    {l.name}
                    <div className="font-mono text-xs text-slate-500">…/hochladen/…{l.schluesselEnde}</div>
                  </td>
                  <td>{l.absenderArt ? t.dateien.absenderArten[l.absenderArt] : <span className="italic text-slate-400">{t.dateien.keinAbsender}</span>}</td>
                  <td>
                    <Marke ton={ton[s]}>{tu.stati[s]}</Marke>
                    {l.widerrufenAm && <div className="text-xs text-slate-500">{f.datum(l.widerrufenAm)}</div>}
                  </td>
                  <td>{f.datum(l.gueltigBis)}</td>
                  <td className={rechts}>{l.anzahlDateien}</td>
                  <td>{l.zuletztGenutzt ? f.datum(l.zuletztGenutzt) : "–"}</td>
                  <td className={rechts}>{s !== "widerrufen" && <Formular aktion={uploadLinkWiderrufen.bind(null, l.id)} absenden={tu.widerrufen} bestaetigen={tu.widerrufenBestaetigen} inline />}</td>
                </tr>
              );
            })}
          </tbody>
        </Tabelle>
      )}
    </Karte>
  );
}
