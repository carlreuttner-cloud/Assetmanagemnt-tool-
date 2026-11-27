"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { aktiverReiter, type NavGruppe } from "@/lib/navigation";

/** Gruppe mit Texten, wie sie die Seitenleiste und die Reiterzeile brauchen. */
export type NavGruppeMitText = NavGruppe & { text: string; reiterTexte: Record<string, string> };

/** Seitenleiste: eine Zeile je Gruppe, Klick öffnet den ersten Reiter der Gruppe. */
export function SeitenleistenNavigation({ gruppen }: { gruppen: NavGruppeMitText[] }) {
  const aktiv = aktiverReiter(gruppen, usePathname())?.gruppe.schluessel;
  return (
    <nav className="flex flex-col gap-1">
      {gruppen.map((g) => (
        <Link
          key={g.schluessel}
          href={g.reiter[0].pfad}
          aria-current={aktiv === g.schluessel ? "page" : undefined}
          className={`rounded-md px-3 py-2 text-sm ${
            aktiv === g.schluessel ? "bg-slate-800 font-medium text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
          }`}
        >
          {g.text}
        </Link>
      ))}
    </nav>
  );
}

/** Reiterzeile oben: die Reiter der aktiven Gruppe. */
export function Reiterzeile({ gruppen }: { gruppen: NavGruppeMitText[] }) {
  const treffer = aktiverReiter(gruppen, usePathname());
  if (!treffer) return null;
  const gruppe = gruppen.find((g) => g.schluessel === treffer.gruppe.schluessel)!;
  return (
    <nav className="mb-6 flex flex-wrap gap-1 border-b border-slate-200" aria-label={gruppe.text}>
      {gruppe.reiter.map((r) => {
        const aktiv = r.pfad === treffer.reiter.pfad;
        return (
          <Link
            key={r.pfad}
            href={r.pfad}
            aria-current={aktiv ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              aktiv ? "border-slate-900 font-medium text-slate-900" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
            }`}
          >
            {gruppe.reiterTexte[r.pfad]}
          </Link>
        );
      })}
    </nav>
  );
}
