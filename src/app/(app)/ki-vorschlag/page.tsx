import Link from "next/link";
import { Formular } from "@/components/formular";
import { Glossar } from "@/components/herleitung";
import { Karte, KnopfLink, Leer, Marke, Seitenkopf, Tabelle, knopfKlasse, type Ton } from "@/components/ui";
import { fuelle, texte, type Texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { ladeVorschlagPaket } from "@/lib/daten/ki-vorschlag";
import { ladeRechengrundlage } from "@/lib/daten/portfolio";
import { formatierer, type Formatierer } from "@/lib/format";
import { dezimal } from "@/lib/geld";
import { kiModus } from "@/lib/ki-claude";
import {
  EXIT_PARAMETER,
  SZENARIO_PARAMETER,
  szenarioJahre,
  verkaufskosten,
  type GepruefterVorschlag,
  type GepruefterWert,
  type Parameter,
  type VorschlagPaket,
  type WertStatus,
} from "@/lib/ki-vorschlag";
import { Belege, DatenpaketAnsicht, LueckenListe, zeitpunkt } from "../ki-assistent/ki-bausteine";
import { vorschlagGenerieren, vorschlagLoeschen } from "./aktionen";

const EINGABE = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm shadow-sm";
const STATUS_TON: Record<WertStatus, Ton> = { ok: "gut", unbekannt: "warnung", ohneBeleg: "schlecht", ungueltig: "schlecht", fehlt: "neutral" };

/** Vorgeschlagener Wert in Normalform als Anzeige. */
function anzeige(p: Parameter, wert: string, t: Texte, f: Formatierer): string {
  const tv = t.kiVorschlag;
  switch (p) {
    case "verkaufsdatum":
      return f.datum(wert);
    case "preisBasis":
      return t.exit.basen[wert as keyof typeof t.exit.basen] ?? wert;
    case "faktor":
      return fuelle(tv.faktorWert, { wert: f.faktor(dezimal(wert), 2) });
    case "leerVermietenMonate":
      return fuelle(tv.monate, { anzahl: wert });
    case "zinsVariabelPP":
      return fuelle(tv.prozentpunkte, { wert: (dezimal(wert).greaterThan(0) ? "+" : "") + f.eingabe(dezimal(wert), 2) });
    default:
      return f.prozent(dezimal(wert), 2);
  }
}

/** Werte für Formularfelder in der Schreibweise des Mandanten. */
const feld = (w: string | null | undefined, f: Formatierer, stellen = 2) => (w ? f.eingabe(dezimal(w), stellen) : "");

function exitLink(hausId: string, w: Partial<Record<Parameter, string | null>>, f: Formatierer): string {
  const q = new URLSearchParams({ h: hausId, d: "1" });
  if (w.verkaufsdatum) q.set("datum", w.verkaufsdatum);
  if (w.preisBasis) q.set("basis", w.preisBasis);
  q.set("faktor", feld(w.faktor, f, 4));
  q.set("makler", feld(w.maklerProzent, f));
  q.set("sonstige", feld(w.sonstigeProzent, f));
  q.set("vfe", feld(w.vfeProzent, f));
  return `/exit?${q.toString()}`;
}

function szenarioLink(paket: VorschlagPaket, w: Partial<Record<Parameter, string | null>>, f: Formatierer): string {
  const q = new URLSearchParams({ g: paket.haus.gesellschaftId, jahre: String(szenarioJahre(paket.stichtag, w.verkaufsdatum ?? null)) });
  const setze = (name: string, wert: string) => wert && q.set(name, wert);
  setze("miete", feld(w.mietsteigerung, f));
  setze("ausfall", feld(w.mietausfall, f));
  setze("leer", w.leerVermietenMonate ?? "");
  setze("wert", feld(w.wertentwicklung, f));
  setze("zins", feld(w.zinsVariabelPP, f));
  setze("anschluss", feld(w.anschlusszins, f));
  const kosten = verkaufskosten(w);
  if (kosten) q.set("kosten", f.eingabe(kosten, 2));
  setze("vfe", feld(w.vfeProzent, f));
  if (w.verkaufsdatum) {
    q.set("v_haus", paket.haus.id);
    q.set("v_datum", w.verkaufsdatum);
  }
  return `/szenarien/neu?${q.toString()}`;
}

function WerteTabelle({ werte, paket, t, f }: { werte: GepruefterWert[]; paket: VorschlagPaket; t: Texte; f: Formatierer }) {
  const tv = t.kiVorschlag;
  return (
    <Tabelle>
      <thead>
        <tr>
          <th>{tv.spalten.parameter}</th>
          <th>{tv.spalten.vorschlag}</th>
          <th>{tv.spalten.begruendung}</th>
          <th>{tv.spalten.status}</th>
        </tr>
      </thead>
      <tbody>
        {werte.map((w) => {
          const hinweis = (tv.einheitHinweis as Partial<Record<Parameter, string>>)[w.parameter];
          return (
            <tr key={w.parameter} className="align-top">
              <td>
                <div className="font-medium">{tv.parameter[w.parameter]}</div>
                {hinweis && <div className="text-xs text-slate-500">{hinweis}</div>}
              </td>
              <td className="whitespace-nowrap tabular-nums">
                {w.wert ? <span className="font-medium">{anzeige(w.parameter, w.wert, t, f)}</span> : <span className="text-slate-400">–</span>}
                {!w.wert && w.roh && <div className="text-xs text-slate-500">{fuelle(tv.vorschlagKi, { wert: w.roh })}</div>}
              </td>
              <td className="max-w-md text-sm">
                {w.begruendung || <span className="text-slate-400">–</span>}
                <Belege ids={w.quellen} unbekannt={w.unbekannt} paket={paket} t={t} />
              </td>
              <td>
                <span title={tv.statusErklaerung[w.status]}>
                  <Marke ton={STATUS_TON[w.status]}>{tv.stati[w.status]}</Marke>
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </Tabelle>
  );
}

export default async function KiVorschlagSeite({ searchParams }: PageProps<"/ki-vorschlag">) {
  const kontext = await pruefeZugriff("szenarien");
  const t = texte(kontext.mandant.sprache);
  const tv = t.kiVorschlag;
  const f = formatierer(kontext.mandant);
  const sp = await searchParams;
  const wert = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const schreiben = darf(kontext.rolle, "szenarien", "schreiben") && darf(kontext.rolle, "kiAssistent", "schreiben");
  const modus = kiModus();

  const { haeuser } = await ladeRechengrundlage(kontext, { bereich: true });
  const liste = await kontext.db.haus.findMany({
    where: { id: { in: haeuser.map((h) => h.id) } },
    orderBy: [{ gesellschaft: { name: "asc" } }, { bezeichnung: "asc" }],
    select: { id: true, bezeichnung: true, gesellschaft: { select: { name: true } } },
  });
  const kopf = <Seitenkopf titel={tv.titel} beschreibung={tv.beschreibung} />;
  if (liste.length === 0) {
    return (
      <div>
        {kopf}
        <Leer>{tv.keineHaeuser}</Leer>
      </div>
    );
  }
  const hausId = liste.find((h) => h.id === wert("h"))?.id ?? liste[0].id;
  const verlauf = await kontext.db.kiVorschlag.findMany({
    where: { hausId },
    orderBy: { erstelltAm: "desc" },
    take: 30,
    select: { id: true, erstelltAm: true, stichtag: true, status: true, modell: true, ergebnis: true, fehler: true, datenpaket: true, tokensEingabe: true, tokensAusgabe: true, benutzer: { select: { name: true } } },
  });
  const gewaehlt = verlauf.find((v) => v.id === wert("v")) ?? verlauf[0] ?? null;
  // Ohne gespeicherten Vorschlag: aktuelles Datenpaket zur Ansicht (wird nicht gesendet)
  const aktuellesPaket = gewaehlt ? null : await ladeVorschlagPaket(kontext, hausId);

  return (
    <div className="max-w-6xl space-y-6">
      {kopf}

      <form method="get" action="/ki-vorschlag" className="flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">{tv.haus}</span>
          <select name="h" defaultValue={hausId} className={EINGABE}>
            {liste.map((h) => (
              <option key={h.id} value={h.id}>
                {h.bezeichnung} · {h.gesellschaft.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className={knopfKlasse("sekundaer")}>
          {tv.anzeigen}
        </button>
        <Link href={`/haeuser/${hausId}`} className="pb-1.5 text-sm text-slate-600 hover:underline">
          {t.exit.zurHaus} →
        </Link>
      </form>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Karte titel={tv.grundsaetze}>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            {Object.values(tv.grundsatzListe).map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </Karte>
        <Karte titel={tv.generieren}>
          {modus === "demo" && <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{tv.demo.hinweis}</p>}
          {modus === "aus" ? (
            <p className="text-sm text-slate-600">{tv.nichtKonfiguriert}</p>
          ) : schreiben ? (
            <Formular aktion={vorschlagGenerieren} absenden={tv.generieren} bestaetigen={modus === "claude" ? tv.bestaetigen : undefined} laeuftText={tv.laeuft}>
              <input type="hidden" name="hausId" value={hausId} />
            </Formular>
          ) : (
            <p className="text-sm text-slate-600">{tv.nurLesen}</p>
          )}
        </Karte>
      </div>

      {gewaehlt && <VorschlagAnsicht v={gewaehlt} hausId={hausId} t={t} f={f} schreiben={schreiben} sprache={kontext.mandant.sprache} />}

      {aktuellesPaket && (
        <Karte titel={tv.datenpaket}>
          <p className="mb-3 text-xs text-slate-500">{fuelle(tv.datenpaketBeschreibung, { stichtag: f.datum(aktuellesPaket.stichtag) })}</p>
          <DatenpaketAnsicht paket={aktuellesPaket} t={t} />
        </Karte>
      )}

      <Karte titel={tv.verlauf}>
        {verlauf.length === 0 ? (
          <Leer>{tv.keinVerlauf}</Leer>
        ) : (
          <Tabelle>
            <thead>
              <tr>
                <th>{tv.zeitpunkt}</th>
                <th>{tv.benutzer}</th>
                <th>{tv.modell}</th>
                <th>{tv.status}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {verlauf.map((v) => {
                const e = v.ergebnis as GepruefterVorschlag | null;
                return (
                  <tr key={v.id}>
                    <td className="whitespace-nowrap">{zeitpunkt(v.erstelltAm, kontext.mandant.sprache)}</td>
                    <td>{v.benutzer?.name ?? "–"}</td>
                    <td className="text-xs">{v.modell}</td>
                    <td>
                      {v.status === "FEHLER" ? (
                        <Marke ton="schlecht">{t.ki.stati.FEHLER}</Marke>
                      ) : (
                        <span className="text-sm">
                          {e?.pruefung.uebernommen ?? 0} {tv.uebernommenZahl}
                        </span>
                      )}
                    </td>
                    <td className="text-right">
                      {v.id === gewaehlt?.id ? (
                        <span className="text-xs text-slate-500">{tv.geoeffnet}</span>
                      ) : (
                        <Link href={`/ki-vorschlag?h=${hausId}&v=${v.id}`} className="text-sm text-teal-700 hover:underline">
                          {tv.oeffnen}
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Tabelle>
        )}
      </Karte>

      <Glossar begriffe={["JNKM", "Kaufpreisfaktor", "Rohertragsfaktor", "Zinsbindung", "Vorfaelligkeit", "Marktwert", "Leerstand"]} t={t} />
    </div>
  );
}

type GespeicherterVorschlag = {
  id: string;
  erstelltAm: Date;
  stichtag: Date;
  status: "ERFOLGREICH" | "FEHLER";
  modell: string;
  ergebnis: unknown;
  fehler: string | null;
  datenpaket: unknown;
  tokensEingabe: number | null;
  tokensAusgabe: number | null;
};

function VorschlagAnsicht({ v, hausId, t, f, schreiben, sprache }: { v: GespeicherterVorschlag; hausId: string; t: Texte; f: Formatierer; schreiben: boolean; sprache: string }) {
  const tv = t.kiVorschlag;
  const paket = v.datenpaket as VorschlagPaket;
  const titel = fuelle(tv.ergebnisTitel, { zeitpunkt: zeitpunkt(v.erstelltAm, sprache) });
  const loeschen = schreiben && <Formular aktion={vorschlagLoeschen.bind(null, v.id)} absenden={tv.loeschen} art="gefahr" bestaetigen={tv.loeschenBestaetigen} inline />;
  if (v.status === "FEHLER" || !v.ergebnis) {
    return (
      <Karte titel={titel} aktionen={loeschen}>
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{fuelle(tv.fehler, { fehler: v.fehler ?? "–" })}</p>
      </Karte>
    );
  }
  const e = v.ergebnis as GepruefterVorschlag;
  const nachParameter = Object.fromEntries(e.werte.map((w) => [w.parameter, w.wert])) as Partial<Record<Parameter, string | null>>;
  const exitWerte = e.werte.filter((w) => (EXIT_PARAMETER as readonly string[]).includes(w.parameter));
  const szenarioWerte = e.werte.filter((w) => (SZENARIO_PARAMETER as readonly string[]).includes(w.parameter));
  const kosten = verkaufskosten(nachParameter);
  const demo = v.modell === tv.demo.modell;
  const pruefungOk = e.pruefung.nichtUebernommen === 0 && e.pruefung.unbekannteVerweise === 0;

  return (
    <div className="space-y-6">
      <Karte titel={titel} aktionen={loeschen}>
        <div className="space-y-3 text-sm">
          <p className="rounded-lg bg-sky-50 p-3 text-sky-900">
            {demo ? tv.demo.kennzeichnung : fuelle(tv.kennzeichnung, { stichtag: f.datum(paket.stichtag) })}
          </p>
          <p className={`rounded-lg p-3 ${pruefungOk ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}>
            {fuelle(tv.pruefungHinweis, { uebernommen: e.pruefung.uebernommen, nicht: e.pruefung.nichtUebernommen, unbekannt: e.pruefung.unbekannteVerweise })}
          </p>
          <div>
            <h3 className="mb-1 font-semibold">{tv.zusammenfassung}</h3>
            <p className="text-slate-700">{e.zusammenfassung}</p>
          </div>
          <p className="text-xs text-slate-500">
            {tv.modell}: {v.modell}
            {v.tokensEingabe !== null && v.tokensAusgabe !== null && ` · ${fuelle(tv.tokens, { ein: v.tokensEingabe, aus: v.tokensAusgabe })}`}
          </p>
        </div>
      </Karte>

      <Karte titel={tv.exitTitel} aktionen={<KnopfLink href={exitLink(hausId, nachParameter, f)} art="primaer">{tv.inExit}</KnopfLink>}>
        <p className="mb-3 text-xs text-slate-500">{tv.exitHinweis}</p>
        <WerteTabelle werte={exitWerte} paket={paket} t={t} f={f} />
      </Karte>

      <Karte titel={tv.szenarioTitel} aktionen={<KnopfLink href={szenarioLink(paket, nachParameter, f)} art="primaer">{tv.inSzenario}</KnopfLink>}>
        <p className="mb-3 text-xs text-slate-500">{fuelle(tv.szenarioHinweis, { gesellschaft: paket.haus.gesellschaft })}</p>
        <WerteTabelle werte={szenarioWerte} paket={paket} t={t} f={f} />
        <ul className="mt-3 space-y-1 text-xs text-slate-600">
          <li>{kosten ? fuelle(tv.szenarioKosten, { wert: f.prozent(kosten, 2) }) : tv.szenarioKostenFehlt}</li>
          {!nachParameter.verkaufsdatum && <li>{tv.ohneVerkauf}</li>}
          {nachParameter.verkaufsdatum && !nachParameter.vfeProzent && <li>{tv.vfeSzenario}</li>}
        </ul>
      </Karte>

      <Karte titel={tv.datenluecken}>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold">{tv.lueckenKi}</h3>
            {e.datenluecken.length === 0 ? (
              <Leer>{t.ki.keineLuecken}</Leer>
            ) : (
              <ul className="space-y-2 text-sm">
                {e.datenluecken.map((l, i) => (
                  <li key={i}>
                    {l.text}
                    <Belege ids={l.quellen} unbekannt={l.unbekannt} paket={paket} t={t} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">{tv.lueckenPaket}</h3>
            <LueckenListe luecken={paket.luecken} t={t} />
          </div>
        </div>
      </Karte>

      <details className="rounded-xl border border-slate-200 bg-white p-5">
        <summary className="cursor-pointer text-sm font-semibold">
          {tv.datenpaket} · {fuelle(t.ki.datenpaketZaehlung, { fakten: paket.fakten.length, luecken: paket.luecken.length })}
        </summary>
        <p className="my-3 text-xs text-slate-500">{fuelle(tv.datenpaketBeschreibung, { stichtag: f.datum(paket.stichtag) })}</p>
        <DatenpaketAnsicht paket={paket} t={t} />
      </details>
    </div>
  );
}
