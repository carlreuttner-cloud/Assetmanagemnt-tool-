import Link from "next/link";
import { fuelle, type Texte } from "@/i18n";
import { Leer, Marke, Tabelle, type Ton } from "@/components/ui";
import type { AussageArt, Datenpaket, Fakt, Luecke } from "@/lib/ki-analyse";

export const ART_TON: Record<AussageArt, Ton> = { BEFUND: "gut", EINSCHAETZUNG: "neutral", ANNAHME: "warnung", EMPFEHLUNG: "neutral" };

export function zeitpunkt(datum: Date, sprache: string) {
  return new Intl.DateTimeFormat(sprache, { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(datum);
}

/** Vollständiges Datenpaket: Fakten als Tabelle mit Sprungmarken, darunter die Lücken. */
export function DatenpaketAnsicht({ paket, t }: { paket: Datenpaket; t: Texte }) {
  const ts = t.ki.spalten;
  return (
    <div className="space-y-4">
      <Tabelle>
        <thead>
          <tr>
            <th>{ts.id}</th>
            <th>{ts.objekt}</th>
            <th>{ts.name}</th>
            <th>{ts.wert}</th>
            <th>{ts.stichtag}</th>
            <th>{ts.quelle}</th>
          </tr>
        </thead>
        <tbody>
          {paket.fakten.map((x) => (
            <tr key={x.id} id={x.id} className="target:bg-amber-50">
              <td className="font-mono text-xs">{x.id}</td>
              <td>
                {x.objekt}
                <div className="text-xs text-slate-500">{t.ki.themen[x.thema]}</div>
              </td>
              <td>{x.href ? <Link href={x.href} className="hover:underline">{x.name}</Link> : x.name}</td>
              <td className="tabular-nums">{x.wert}</td>
              <td className="whitespace-nowrap text-xs">{x.stichtag ?? "–"}</td>
              <td className="text-xs text-slate-600">{x.quelle}</td>
            </tr>
          ))}
        </tbody>
      </Tabelle>
      <div>
        <h3 className="mb-2 text-sm font-semibold">{t.ki.datenluecken}</h3>
        <LueckenListe luecken={paket.luecken} t={t} />
      </div>
    </div>
  );
}

export function LueckenListe({ luecken, t }: { luecken: Luecke[]; t: Texte }) {
  if (luecken.length === 0) return <Leer>{t.ki.keineLuecken}</Leer>;
  return (
    <ul className="space-y-1 text-sm">
      {luecken.map((l) => (
        <li key={l.id} id={l.id} className="target:bg-amber-50">
          <span className="mr-2 font-mono text-xs text-slate-500">{l.id}</span>
          <span className="text-slate-500">{l.objekt}:</span> {l.href ? <Link href={l.href} className="hover:underline">{l.text}</Link> : l.text}
        </li>
      ))}
    </ul>
  );
}

/** Belege einer Aussage: die zitierten Fakten und Lücken mit Wert, Stichtag und Quelle. */
export function Belege({ ids, unbekannt, paket, t }: { ids: string[]; unbekannt: string[]; paket: Datenpaket; t: Texte }) {
  const fakten = new Map<string, Fakt>(paket.fakten.map((x) => [x.id, x]));
  const luecken = new Map<string, Luecke>(paket.luecken.map((x) => [x.id, x]));
  if (ids.length === 0 && unbekannt.length === 0) return null;
  return (
    <details className="mt-1 text-xs text-slate-600">
      <summary className="cursor-pointer select-none">
        {t.ki.belege}: {ids.map((id) => (
          <span key={id} className="mr-1 font-mono">{id}</span>
        ))}
      </summary>
      <ul className="mt-1 space-y-0.5 border-l-2 border-slate-200 pl-3">
        {ids.map((id) => {
          const x = fakten.get(id);
          const l = luecken.get(id);
          return (
            <li key={id}>
              <a href={`#${id}`} className="font-mono text-slate-500 hover:underline">{id}</a>{" "}
              {x ? (
                <>
                  {x.objekt} · {x.name}: <span className="font-medium text-slate-800">{x.wert}</span> · {x.stichtag ?? "–"} · {x.quelle}
                </>
              ) : (
                l && <>{l.objekt}: {l.text}</>
              )}
            </li>
          );
        })}
        {unbekannt.length > 0 && <li className="text-red-700">{fuelle(t.ki.unbekannteVerweise, { ids: unbekannt.join(", ") })}</li>}
      </ul>
    </details>
  );
}

export function ArtMarke({ art, t }: { art: AussageArt; t: Texte }) {
  return (
    <span title={t.ki.artErklaerung[art]}>
      <Marke ton={ART_TON[art]}>{t.ki.arten[art]}</Marke>
    </span>
  );
}
