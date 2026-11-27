"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { SuchArt, Treffer } from "@/lib/suche";

type Gruppe = { art: SuchArt; treffer: Treffer[]; mehr: boolean };
type Texte = { platzhalter: string; kuerzel: string; label: string; alleAnzeigen: string; laeuft: string; keineTreffer: string; arten: Record<SuchArt, string> };

/** Suchfeld in der Seitenleiste mit Vorschlägen; Enter öffnet die Trefferseite. */
export function GlobaleSuche({ texte }: { texte: Texte }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  // Ergebnis mit dem Begriff, zu dem es gehört; veraltete Ergebnisse werden nicht gezeigt.
  const [ergebnis, setErgebnis] = useState<{ fuer: string; gruppen: Gruppe[] } | null>(null);
  const [offen, setOffen] = useState(false);
  const liste = useId();
  const rahmen = useRef<HTMLDivElement>(null);
  const feld = useRef<HTMLInputElement>(null);

  // Strg+K (Mac: ⌘K) springt von überall in die Suche
  useEffect(() => {
    const taste = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        feld.current?.focus();
        feld.current?.select();
        setOffen(true);
      }
    };
    document.addEventListener("keydown", taste);
    return () => document.removeEventListener("keydown", taste);
  }, []);

  useEffect(() => {
    const begriff = q.trim();
    if (begriff.length < 2) return;
    const abbruch = new AbortController();
    const zeit = setTimeout(async () => {
      try {
        const antwort = await fetch(`/api/suche?q=${encodeURIComponent(begriff)}`, { signal: abbruch.signal });
        if (antwort.ok) setErgebnis({ fuer: begriff, gruppen: ((await antwort.json()) as { gruppen: Gruppe[] }).gruppen });
      } catch {
        // abgebrochen oder offline: Vorschläge einfach weglassen
      }
    }, 250);
    return () => {
      clearTimeout(zeit);
      abbruch.abort();
    };
  }, [q]);

  useEffect(() => {
    const zu = (e: MouseEvent) => {
      if (rahmen.current && !rahmen.current.contains(e.target as Node)) setOffen(false);
    };
    document.addEventListener("mousedown", zu);
    return () => document.removeEventListener("mousedown", zu);
  }, []);

  const begriff = q.trim();
  const gruppen = ergebnis?.fuer === begriff ? ergebnis.gruppen : null;
  return (
    <div ref={rahmen} className="relative">
      <form
        role="search"
        className="relative"
        onSubmit={(e) => {
          e.preventDefault();
          if (begriff.length < 2) return;
          setOffen(false);
          router.push(`/suche?q=${encodeURIComponent(begriff)}`);
        }}
      >
        <input
          ref={feld}
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOffen(true);
          }}
          onFocus={() => setOffen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOffen(false);
              feld.current?.blur();
            }
          }}
          placeholder={texte.platzhalter}
          aria-label={texte.label}
          aria-controls={liste}
          aria-keyshortcuts="Control+K"
          className="w-full rounded bg-slate-800 py-1.5 pl-2.5 pr-14 text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-500"
        />
        {!q && <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-slate-600 px-1 font-sans text-[10px] text-slate-400">{texte.kuerzel}</kbd>}
      </form>
      {offen && begriff.length >= 2 && (
        <div id={liste} className="absolute bottom-full left-0 z-30 mb-2 max-h-[70vh] w-80 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 text-sm text-slate-800 shadow-xl">
          {gruppen === null ? (
            <div className="px-2 py-1 text-xs text-slate-500">{texte.laeuft}</div>
          ) : gruppen.length === 0 ? (
            <div className="px-2 py-1 text-xs text-slate-500">{texte.keineTreffer.replace("{begriff}", begriff)}</div>
          ) : (
            gruppen.map((g) => (
              <div key={g.art} className="mb-1">
                <div className="px-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{texte.arten[g.art]}</div>
                {g.treffer.map((x) => (
                  <Link key={x.id} href={x.href} onClick={() => setOffen(false)} className="block rounded px-2 py-1 hover:bg-slate-100">
                    <div className="font-medium">{x.titel}</div>
                    {(x.feld && x.fundstelle ? `${x.feld}: ${x.fundstelle}` : x.unter) && (
                      <div className="text-xs text-slate-500">{x.feld && x.fundstelle ? `${x.feld}: ${x.fundstelle}` : x.unter}</div>
                    )}
                  </Link>
                ))}
              </div>
            ))
          )}
          <Link
            href={`/suche?q=${encodeURIComponent(begriff)}`}
            onClick={() => setOffen(false)}
            className="mt-1 block border-t border-slate-100 px-2 pt-2 text-xs font-medium text-teal-700 hover:underline"
          >
            {texte.alleAnzeigen}
          </Link>
        </div>
      )}
    </div>
  );
}
