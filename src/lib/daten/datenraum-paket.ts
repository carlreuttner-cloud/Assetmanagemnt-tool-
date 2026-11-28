import "server-only";
import { fuelle, type Texte } from "@/i18n";
import { lese } from "@/lib/dateispeicher";
import { csv } from "@/lib/datenraum";
import type { Formatierer } from "@/lib/format";
import type { ZipEintrag } from "@/lib/zip";
import type { Datenraum } from "./datenraum";

const enc = new TextEncoder();
const text = (s: string) => async () => enc.encode(s);
const KOMPRIMIERBAR = /^(text\/|application\/(json|xml|vnd\.openxmlformats))/;

/** Einträge des ZIP-Archivs: Liesmich, Inhaltsverzeichnis, Pflichtdokumente und die Dateien selbst. */
export function datenraumEintraege(raum: Datenraum, t: Texte, f: Formatierer, von: string, jetzt: Date): ZipEintrag[] {
  const td = t.datenraum;
  const s = td.spalten;
  const wurzel = raum.eintraege[0]?.pfad.split("/")[0] ?? `Datenraum ${raum.name}`.replace(/[^A-Za-z0-9 ._-]/g, "-");
  const zuordnung = (d: Datenraum["eintraege"][number]["dokument"]) =>
    [d.gesellschaft, d.kredit, d.haus, [d.einheit, d.mieter].filter(Boolean).join(" – ") || null].filter(Boolean).join(" · ");
  const inhalt = csv([
    [s.nr, s.pfad, s.titel, s.kategorie, s.jahr, s.datum, s.zuordnung, s.absender, s.status, s.dateiname, s.groesse, s.pruefsumme],
    ...raum.eintraege.map((e) => [
      e.nr,
      e.pfad.slice(wurzel.length + 1),
      e.dokument.titel,
      e.dokument.kategorie,
      e.dokument.jahr,
      e.dokument.dokumentDatum ? f.datum(e.dokument.dokumentDatum) : null,
      zuordnung(e.dokument),
      e.dokument.absender,
      e.dokument.bestaetigt ? td.bestaetigt : td.vorschlag,
      e.dokument.dateiname,
      Math.ceil(e.dokument.groesseBytes / 1024),
      e.dokument.pruefsumme,
    ]),
  ]);
  const zellen = raum.pflicht.flatMap((z) => z.zellen.map((c) => ({ z, c })));
  const luecken = zellen.filter(({ c }) => c.bewertung.status === "fehlt" || c.bewertung.status === "veraltet" || c.bewertung.status === "datumFehlt").length;
  const pflicht = csv([
    [s.objekt, s.objektArt, s.pflichtdokument, s.status, s.datum, s.gueltigBis, s.ablageort],
    ...zellen.map(({ z, c }) => [
      z.objekt.name,
      t.datenraum.bezug[z.objekt.bezug],
      c.vorgabe.name,
      t.dokumente.statusArten[c.bewertung.status],
      c.bewertung.datum ? f.datum(c.bewertung.datum) : null,
      c.bewertung.gueltigBis ? f.datum(c.bewertung.gueltigBis) : null,
      c.nachweis?.ablageort ?? null,
    ]),
  ]);
  const liesmich = fuelle(td.liesmich, {
    name: raum.name,
    gesellschaft: raum.gesellschaft,
    datum: f.datum(jetzt.toISOString().slice(0, 10)),
    von,
    anzahl: raum.eintraege.length,
    ausgelassen: raum.ausgelassen,
    luecken,
  });
  return [
    { pfad: `${wurzel}/${td.dateiLiesmich}`, datum: jetzt, komprimieren: true, inhalt: text(liesmich) },
    { pfad: `${wurzel}/${td.dateiInhalt}`, datum: jetzt, komprimieren: true, inhalt: text(inhalt) },
    { pfad: `${wurzel}/${td.dateiPflicht}`, datum: jetzt, komprimieren: true, inhalt: text(pflicht) },
    ...raum.eintraege.map(
      (e): ZipEintrag => ({
        pfad: e.pfad,
        datum: e.dokument.dokumentDatum ? new Date(`${e.dokument.dokumentDatum}T12:00:00Z`) : jetzt,
        komprimieren: KOMPRIMIERBAR.test(e.dokument.mimeType),
        inhalt: async () => {
          const pfad = raum.speicherPfade.get(e.dokument.id);
          const daten = pfad ? await lese(pfad).catch(() => null) : null;
          return daten ? new Uint8Array(daten) : enc.encode(`${td.fehltDatei}: ${e.dokument.dateiname}`);
        },
      }),
    ),
  ];
}
