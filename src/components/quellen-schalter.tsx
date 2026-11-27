"use client";

import { useState } from "react";
import { QUELLEN_COOKIE } from "@/lib/quellen";

/** Schaltet Stichtage und Quellen unter allen belegten Zahlen ein und aus (ohne Neuladen). */
export function QuellenSchalter({ an: anfangs, texte }: { an: boolean; texte: { schalter: string; an: string; aus: string; hinweis: string } }) {
  const [an, setAn] = useState(anfangs);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={an}
      title={texte.hinweis}
      onClick={() => {
        const neu = !an;
        setAn(neu);
        document.getElementById("inhalt")?.setAttribute("data-quellen", neu ? "an" : "aus");
        document.cookie = `${QUELLEN_COOKIE}=${neu ? "an" : "aus"}; path=/; max-age=31536000; samesite=lax`;
      }}
      className="inline-flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
    >
      <span className={`relative inline-block h-4 w-7 rounded-full transition ${an ? "bg-teal-600" : "bg-slate-300"}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition ${an ? "left-3.5" : "left-0.5"}`} />
      </span>
      {texte.schalter}: {an ? texte.an : texte.aus}
    </button>
  );
}
