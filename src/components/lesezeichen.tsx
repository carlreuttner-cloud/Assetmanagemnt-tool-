"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { favoritSetzen } from "@/app/aktionen";
import type { LesezeichenArt, LesezeichenEintrag } from "@/lib/lesezeichen";

const EREIGNIS = "lesezeichen-geaendert";

/** Stern auf Detailseiten: als Favorit merken oder entfernen. */
export function FavoritKnopf({
  art,
  pfad,
  titel,
  istFavorit,
  texte,
}: {
  art: LesezeichenArt;
  pfad: string;
  titel: string;
  istFavorit: boolean;
  texte: { merken: string; entfernen: string };
}) {
  const [favorit, setFavorit] = useState(istFavorit);
  const [laeuft, starte] = useTransition();
  return (
    <button
      type="button"
      disabled={laeuft}
      aria-pressed={favorit}
      title={favorit ? texte.entfernen : texte.merken}
      onClick={() =>
        starte(async () => {
          const neu = !favorit;
          setFavorit(neu);
          await favoritSetzen(art, pfad, titel, neu);
          window.dispatchEvent(new Event(EREIGNIS));
        })
      }
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ring-1 ring-inset disabled:opacity-60 ${
        favorit ? "bg-amber-50 text-amber-800 ring-amber-300" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"
      }`}
    >
      <span aria-hidden>{favorit ? "★" : "☆"}</span>
      {favorit ? texte.entfernen : texte.merken}
    </button>
  );
}

/** Favoriten und „zuletzt angesehen“ in der Seitenleiste; lädt nach jeder Navigation neu. */
export function Merkliste({ texte }: { texte: { favoriten: string; zuletzt: string; keineFavoriten: string } }) {
  const pfad = usePathname();
  const [daten, setDaten] = useState<{ favoriten: LesezeichenEintrag[]; zuletzt: LesezeichenEintrag[] } | null>(null);
  const [zaehler, setZaehler] = useState(0);

  useEffect(() => {
    const neu = () => setZaehler((z) => z + 1);
    window.addEventListener(EREIGNIS, neu);
    return () => window.removeEventListener(EREIGNIS, neu);
  }, []);

  useEffect(() => {
    const abbruch = new AbortController();
    // Kurz warten, damit der Aufruf der neuen Seite schon gemerkt ist
    const zeit = setTimeout(() => {
      fetch("/api/lesezeichen", { signal: abbruch.signal })
        .then((a) => (a.ok ? a.json() : null))
        .then((d) => d && setDaten(d))
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(zeit);
      abbruch.abort();
    };
  }, [pfad, zaehler]);

  if (!daten) return null;
  const liste = (eintraege: LesezeichenEintrag[], stern: boolean) => (
    <ul className="mt-1 space-y-0.5">
      {eintraege.map((e) => (
        <li key={e.pfad}>
          <Link
            href={e.pfad}
            aria-current={e.pfad === pfad ? "page" : undefined}
            className={`block truncate rounded px-2 py-1 text-xs ${e.pfad === pfad ? "bg-slate-800 text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`}
            title={e.titel}
          >
            {stern && <span className="mr-1 text-amber-400">★</span>}
            {e.titel}
          </Link>
        </li>
      ))}
    </ul>
  );
  return (
    <div className="mt-6 space-y-3 px-1">
      <details open>
        <summary className="cursor-pointer px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{texte.favoriten}</summary>
        {daten.favoriten.length === 0 ? <p className="px-2 pt-1 text-xs text-slate-500">{texte.keineFavoriten}</p> : liste(daten.favoriten, true)}
      </details>
      {daten.zuletzt.length > 0 && (
        <details open>
          <summary className="cursor-pointer px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{texte.zuletzt}</summary>
          {liste(daten.zuletzt, false)}
        </details>
      )}
    </div>
  );
}
