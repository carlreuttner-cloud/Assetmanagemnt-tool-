import Link from "next/link";
import { Karte, Leer, Seitenkopf } from "@/components/ui";
import { fuelle, texte } from "@/i18n";
import { pruefeZugriff } from "@/lib/auth/kontext";
import { suche } from "@/lib/daten/suche";
import { einParam } from "@/lib/filter";
import { suchbegriff } from "@/lib/suche";

export default async function SuchSeite({ searchParams }: PageProps<"/suche">) {
  const { q } = await searchParams;
  const kontext = await pruefeZugriff("suche");
  const t = texte(kontext.mandant.sprache);
  const ts = t.suche;
  const roh = einParam(q) ?? "";
  const s = suchbegriff(roh);
  const gruppen = s ? await suche(kontext, s, t, 50) : [];

  return (
    <div className="max-w-4xl space-y-6">
      <Seitenkopf titel={s ? fuelle(ts.ergebnisse, { begriff: s.text }) : ts.titel} beschreibung={ts.hinweis} />
      <form method="get" action="/suche" className="flex gap-2">
        <input
          name="q"
          defaultValue={roh}
          aria-label={ts.label}
          placeholder={ts.platzhalter}
          className="block w-full max-w-md rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-slate-500 focus:outline-none"
        />
        <button className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700">{ts.titel}</button>
      </form>
      <p className="text-xs text-slate-500">{ts.ohneAuswahl}</p>
      {!s ? (
        roh && <Leer>{ts.zuKurz}</Leer>
      ) : gruppen.length === 0 ? (
        <Leer>{fuelle(ts.keineTreffer, { begriff: s.text })}</Leer>
      ) : (
        gruppen.map((g) => (
          <Karte key={g.art} titel={`${ts.arten[g.art]} (${g.treffer.length}${g.mehr ? "+" : ""})`}>
            <ul className="divide-y divide-slate-100">
              {g.treffer.map((x) => (
                <li key={x.id} className="py-2">
                  <Link href={x.href} className="font-medium text-slate-900 hover:underline">
                    <Markiert text={x.titel} begriff={s.text} />
                  </Link>
                  {x.unter && <div className="text-xs text-slate-500">{x.unter}</div>}
                  {x.feld && x.fundstelle && (
                    <div className="text-xs text-slate-600">
                      {x.feld}: <Markiert text={x.fundstelle} begriff={s.text} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {g.mehr && <p className="mt-2 text-xs text-amber-800">{ts.mehr}</p>}
          </Karte>
        ))
      )}
    </div>
  );
}

/** Hebt den Suchbegriff im Text hervor (Groß-/Kleinschreibung egal). */
function Markiert({ text, begriff }: { text: string; begriff: string }) {
  const i = text.toLocaleLowerCase("de-DE").indexOf(begriff.toLocaleLowerCase("de-DE"));
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-yellow-100 px-0.5">{text.slice(i, i + begriff.length)}</mark>
      {text.slice(i + begriff.length)}
    </>
  );
}
