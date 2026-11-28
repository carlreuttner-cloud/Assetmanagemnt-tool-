import Link from "next/link";
import { Kachel, Kacheln, Karte, Leer, Marke, Reiter, Seitenkopf, Tabelle, type Ton } from "@/components/ui";
import { fuelle, texte, type Texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { alsDbDatum, heute, plusMonate } from "@/lib/datum";
import { ladeFristEingabe } from "@/lib/daten/fristen";
import { auswahlOptionen, einParam, filterHref } from "@/lib/filter";
import { formatierer } from "@/lib/format";
import { FRIST_ARTEN, nachMonat, sammleFristen, type Frist, type FristArt } from "@/lib/fristen";
import { AuswahlFilter, FilterZeile } from "@/components/auswahl-filter";

const ZEITRAEUME = ["12", "24", "36", "alle"] as const;
const TON: Record<FristArt, Ton> = { refinanzierung: "warnung", kapitalabruf: "warnung", sondertilgung: "gut", zinsbindung: "schlecht", kreditende: "warnung", sicherungsende: "warnung", covenanttest: "neutral", mietende: "warnung", mieterhoehung: "gut", energieausweis: "warnung" };

export default async function FristenSeite({ searchParams }: PageProps<"/fristen">) {
  const sp = await searchParams;
  const kontext = await pruefeZugriff("uebersicht");
  const t = texte(kontext.mandant.sprache);
  const f = formatierer(kontext.mandant);
  const tf = t.fristen;
  const stichtag = heute();
  const zeitraum = ZEITRAEUME.find((z) => z === sp.zeitraum) ?? "12";
  const art = FRIST_ARTEN.find((a) => a === sp.art);
  const filter = { zeitraum: zeitraum === "12" ? undefined : zeitraum, art, g: einParam(sp.g) };
  const bis = zeitraum === "alle" ? null : plusMonate(stichtag, Number(zeitraum));

  const eingabe = await ladeFristEingabe(kontext);
  const { fristen: alle, luecken } = sammleFristen(eingabe, stichtag, bis, tf, (d) => f.datum(d));
  const sichtbareLuecken = art ? luecken.filter((l) => l.art === art) : luecken;
  const nachG = filter.g ? alle.filter((x) => x.gesellschaftId === filter.g) : alle;
  const fristen = art ? nachG.filter((x) => x.art === art) : nachG;
  const { faellig, monate } = nachMonat(fristen, stichtag);
  const monatsName = new Intl.DateTimeFormat(f.sprache, { timeZone: "UTC", month: "long", year: "numeric" });
  const anzahl = (a: FristArt) => nachG.filter((x) => x.art === a && x.datum >= stichtag).length;

  return (
    <div className="space-y-6">
      <Seitenkopf titel={tf.titel} beschreibung={tf.beschreibung} />

      <div>
        <Reiter
          eintraege={ZEITRAEUME.map((z) => ({
            href: filterHref("/fristen", filter, "zeitraum", z === "12" ? undefined : z),
            text: z === "alle" ? tf.alle : fuelle(tf.monate, { anzahl: z }),
            aktiv: zeitraum === z,
          }))}
        />
        <Reiter
          eintraege={[
            { href: filterHref("/fristen", filter, "art", undefined), text: tf.alleArten, aktiv: !art },
            ...FRIST_ARTEN.map((a) => ({ href: filterHref("/fristen", filter, "art", a), text: tf.arten[a], aktiv: art === a })),
          ]}
        />
        {eingabe.gesellschaften.length > 1 && (
          <FilterZeile>
            <AuswahlFilter name="g" label={t.listen.gesellschaft} optionen={auswahlOptionen("/fristen", filter, "g", tf.alleGesellschaften, eingabe.gesellschaften)} />
          </FilterZeile>
        )}
      </div>

      <Kacheln>
        {FRIST_ARTEN.map((a) => (
          <Kachel key={a} titel={tf.arten[a]} wert={anzahl(a)} unter={zeitraum === "alle" ? tf.alle : fuelle(tf.monate, { anzahl: zeitraum })} />
        ))}
      </Kacheln>

      {faellig.length > 0 && (
        <Karte titel={`${tf.faellig} (${faellig.length})`}>
          <p className="-mt-2 mb-3 text-xs text-slate-500">{tf.faelligHinweis}</p>
          <FaelligListe fristen={faellig} t={t} datum={(d) => f.datum(d)} />
        </Karte>
      )}

      {monate.length === 0 && faellig.length === 0 ? (
        <Karte>
          <Leer>{tf.keine}</Leer>
        </Karte>
      ) : (
        monate.map(([monat, liste]) => (
          <Karte key={monat} titel={`${monatsName.format(alsDbDatum(`${monat}-01`))} · ${liste.length === 1 ? tf.eineFrist : fuelle(tf.anzahl, { anzahl: liste.length })}`}>
            <FristTabelle fristen={liste} t={t} datum={(d) => f.datum(d)} />
          </Karte>
        ))
      )}

      {sichtbareLuecken.length > 0 && (
        <Karte titel={`${tf.luecken} (${sichtbareLuecken.length})`}>
          <p className="mb-3 text-xs text-slate-500">{tf.lueckenHinweis}</p>
          {[...new Set(sichtbareLuecken.map((l) => l.art))].map((a) => {
            const liste = sichtbareLuecken.filter((l) => l.art === a);
            return (
              <details key={a} className="mb-2" data-luecken={a}>
                <summary className="cursor-pointer text-sm text-slate-700">
                  {tf.arten[a]} ({liste.length})
                </summary>
                <ul className="mt-2 space-y-1 text-sm">
                  {liste.map((l, i) => (
                    <li key={`${l.href}-${i}`}>
                      <Link href={l.href} className="hover:underline">
                        {l.titel}
                      </Link>
                      <span className="text-xs text-slate-500">
                        {" "}
                        · {l.unter} · {l.grund}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            );
          })}
        </Karte>
      )}

      <p className="text-xs text-slate-500">
        <span className="font-medium">{tf.regeln}:</span> {tf.regelText}
      </p>
    </div>
  );
}

function FristTabelle({ fristen, t, datum }: { fristen: Frist[]; t: Texte; datum: (d: string) => string }) {
  const tf = t.fristen;
  return (
    <Tabelle>
      <thead>
        <tr>
          <th>{tf.datum}</th>
          <th>{t.listen.art}</th>
          <th>{tf.objekt}</th>
          <th>{tf.grundlage}</th>
        </tr>
      </thead>
      <tbody>
        {fristen.map((x) => (
          <tr key={`${x.art}-${x.href}`} className="align-top hover:bg-slate-50">
            <td className="whitespace-nowrap">{datum(x.datum)}</td>
            <td>
              <Marke ton={TON[x.art]}>{tf.arten[x.art]}</Marke>
            </td>
            <td>
              <Link href={x.href} className="font-medium hover:underline">
                {x.titel}
              </Link>
              <div className="text-xs text-slate-500">{x.unter}</div>
            </td>
            <td className="max-w-md text-xs text-slate-600">{x.grundlage}</td>
          </tr>
        ))}
      </tbody>
    </Tabelle>
  );
}

/** Fällige Fristen; schon mögliche Mieterhöhungen je Haus zusammengefasst, weil es viele sein können. */
function FaelligListe({ fristen, t, datum }: { fristen: Frist[]; t: Texte; datum: (d: string) => string }) {
  const andere = fristen.filter((x) => x.art !== "mieterhoehung");
  const erhoehungen = fristen.filter((x) => x.art === "mieterhoehung");
  const jeHaus = new Map<string, Frist[]>();
  for (const x of erhoehungen) {
    const haus = x.titel.split(" · ").slice(1).join(" · ");
    jeHaus.set(haus, [...(jeHaus.get(haus) ?? []), x]);
  }
  return (
    <div className="space-y-4">
      {andere.length > 0 && <FristTabelle fristen={andere} t={t} datum={datum} />}
      {jeHaus.size > 0 && (
        <div>
          <div className="mb-2">
            <Marke ton={TON.mieterhoehung}>{t.fristen.arten.mieterhoehung}</Marke>
          </div>
          <div className="space-y-1">
            {[...jeHaus.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([haus, liste]) => (
                <details key={haus} className="rounded border border-slate-100 px-3 py-1.5">
                  <summary className="cursor-pointer text-sm">
                    <span className="font-medium">{haus}</span> <span className="text-slate-500">· {fuelle(t.fristen.proHaus, { anzahl: liste.length })}</span>
                  </summary>
                  <div className="mt-2">
                    <FristTabelle fristen={liste} t={t} datum={datum} />
                  </div>
                </details>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
