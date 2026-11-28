import { Ankreuzfeld, Auswahl, Felder, Kachel, Kacheln, Karte, Leer, Marke, Seitenkopf, Tabelle, knopfKlasse, rechts, type Ton } from "@/components/ui";
import { texte } from "@/i18n";
import { bereichsSicht } from "@/lib/auth/auswahl";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { idFilter } from "@/lib/auth/sichtbarkeit";
import { ladeDatenraum } from "@/lib/daten/datenraum";
import type { PaketArt } from "@/lib/datenraum";
import type { DokumentStatus } from "@/lib/dokumente";
import { formatierer } from "@/lib/format";
import { dezimal } from "@/lib/geld";

const STATUS_TON: Record<DokumentStatus, Ton> = { vorhanden: "gut", laeuftAb: "warnung", veraltet: "schlecht", datumFehlt: "warnung", fehlt: "schlecht", nichtErforderlich: "neutral" };
const LUECKE: DokumentStatus[] = ["fehlt", "veraltet", "datumFehlt"];

export default async function DatenraumSeite({ searchParams }: PageProps<"/datenraum">) {
  const kontext = await pruefeZugriff("dokumente", "schreiben");
  const t = texte(kontext.mandant.sprache);
  const td = t.datenraum;
  const f = formatierer(kontext.mandant);
  const sp = await searchParams;
  const wert = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const art: PaketArt | null = wert("art") === "gesellschaft" || wert("art") === "haus" ? (wert("art") as PaketArt) : null;
  const id = art ? wert(art) : "";
  const unbestaetigt = wert("unbestaetigt") === "on" || wert("unbestaetigt") === "1";
  const sicht = await bereichsSicht(kontext);
  const [gesellschaften, haeuser, raum] = await Promise.all([
    kontext.db.gesellschaft.findMany({ where: { id: idFilter(sicht.gesellschaftIds) }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    kontext.db.haus.findMany({ where: { id: idFilter(sicht.hausIds) }, orderBy: { bezeichnung: "asc" }, select: { id: true, bezeichnung: true, gesellschaft: { select: { name: true } } } }),
    art && id ? ladeDatenraum(kontext, art, id, td.ordner, { unbestaetigt }) : Promise.resolve(null),
  ]);
  const zellen = raum?.pflicht.flatMap((z) => z.zellen.map((c) => ({ z, c }))) ?? [];
  const luecken = zellen.filter(({ c }) => LUECKE.includes(c.bewertung.status)).length;
  const download = raum ? `/api/datenraum?art=${raum.art}&id=${raum.id}${unbestaetigt ? "&unbestaetigt=1" : ""}` : null;

  const auswahl = (a: PaketArt) => (
    <Karte titel={td.arten[a]}>
      <form method="get" className="space-y-3">
        <input type="hidden" name="art" value={a} />
        <Felder>
          {a === "gesellschaft" ? (
            <Auswahl name="gesellschaft" label={td.gesellschaft} wert={art === a ? id : undefined} optionen={gesellschaften.map((g) => ({ wert: g.id, text: g.name }))} pflicht />
          ) : (
            <Auswahl name="haus" label={td.haus} wert={art === a ? id : undefined} optionen={haeuser.map((h) => ({ wert: h.id, text: `${h.bezeichnung} (${h.gesellschaft.name})` }))} pflicht />
          )}
        </Felder>
        <Ankreuzfeld name="unbestaetigt" label={td.unbestaetigt} wert={art === a && unbestaetigt} />
        <button type="submit" className={knopfKlasse("sekundaer")}>
          {td.anzeigen}
        </button>
      </form>
    </Karte>
  );

  return (
    <div className="max-w-6xl space-y-6">
      <Seitenkopf titel={t.navigation.datenraum} beschreibung={t.seiten.datenraum} />
      <div className="grid gap-6 md:grid-cols-2">
        {auswahl("gesellschaft")}
        {auswahl("haus")}
      </div>
      <p className="text-xs text-slate-500">{td.hinweisRechte}</p>

      {art && id && !raum && <Leer>{td.nichtGefunden}</Leer>}
      {raum && (
        <>
          <Kacheln>
            <Kachel titel={td.kacheln.dokumente} wert={raum.eintraege.length} />
            <Kachel titel={td.kacheln.groesse} wert={raum.bytes < 1_048_576 ? `${f.zahl(dezimal(Math.ceil(raum.bytes / 1024)), 0)} KB` : `${f.zahl(dezimal(raum.bytes).dividedBy(1_048_576), 1)} MB`} />
            <Kachel titel={td.kacheln.pflichtFehlt} wert={luecken} ton={luecken > 0 ? "warnung" : undefined} />
            <Kachel titel={td.kacheln.ausgelassen} wert={raum.ausgelassen} />
          </Kacheln>
          <Karte
            titel={`${td.vorschau}: ${raum.name}`}
            aktionen={
              download && (
                <a href={download} className={knopfKlasse("primaer")} download>
                  {td.herunterladen}
                </a>
              )
            }
          >
            {raum.eintraege.length === 0 ? (
              <Leer>{td.keine}</Leer>
            ) : (
              <Tabelle>
                <thead>
                  <tr>
                    <th className={rechts}>{td.spalten.nr}</th>
                    <th>{td.spalten.pfad}</th>
                    <th>{td.spalten.titel}</th>
                    <th>{td.spalten.status}</th>
                    <th className={rechts}>{td.spalten.groesse}</th>
                  </tr>
                </thead>
                <tbody>
                  {raum.eintraege.map((e) => (
                    <tr key={e.dokument.id} data-pfad={e.pfad}>
                      <td className={rechts}>{e.nr}</td>
                      <td className="font-mono text-xs">{e.pfad.split("/").slice(1).join(" / ")}</td>
                      <td>{e.dokument.titel}</td>
                      <td>{e.dokument.bestaetigt ? <Marke ton="gut">{td.bestaetigt}</Marke> : <Marke ton="warnung">{td.vorschlag}</Marke>}</td>
                      <td className={rechts}>{f.zahl(dezimal(Math.ceil(e.dokument.groesseBytes / 1024)), 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </Tabelle>
            )}
          </Karte>
          <Karte titel={td.pflicht}>
            <p className="-mt-2 mb-3 text-xs text-slate-500">{td.pflichtHinweis}</p>
            {zellen.length === 0 ? (
              <Leer>{td.keinePflicht}</Leer>
            ) : (
              <Tabelle>
                <thead>
                  <tr>
                    <th>{td.spalten.objekt}</th>
                    <th>{td.spalten.pflichtdokument}</th>
                    <th>{td.spalten.status}</th>
                    <th>{td.spalten.datum}</th>
                    <th>{td.spalten.ablageort}</th>
                  </tr>
                </thead>
                <tbody>
                  {zellen.map(({ z, c }) => (
                    <tr key={`${z.objekt.id}-${c.vorgabe.id}`}>
                      <td>
                        {z.objekt.name}
                        <div className="text-xs text-slate-500">{t.datenraum.bezug[z.objekt.bezug]}</div>
                      </td>
                      <td>{c.vorgabe.name}</td>
                      <td>
                        <Marke ton={STATUS_TON[c.bewertung.status]}>{t.dokumente.statusArten[c.bewertung.status]}</Marke>
                      </td>
                      <td>{c.bewertung.datum ? f.datum(c.bewertung.datum) : "–"}</td>
                      <td className="text-sm">{c.nachweis?.ablageort ?? "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </Tabelle>
            )}
          </Karte>
        </>
      )}
    </div>
  );
}
