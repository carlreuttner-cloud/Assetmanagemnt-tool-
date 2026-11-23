"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type SeitenleistenLink = { pfad: string; text: string };

export function SeitenleistenNavigation({ links }: { links: SeitenleistenLink[] }) {
  const aktuell = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {links.map((link) => {
        const aktiv = link.pfad === "/" ? aktuell === "/" : aktuell.startsWith(link.pfad);
        return (
          <Link
            key={link.pfad}
            href={link.pfad}
            aria-current={aktiv ? "page" : undefined}
            className={`rounded-md px-3 py-2 text-sm ${
              aktiv ? "bg-slate-800 font-medium text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            {link.text}
          </Link>
        );
      })}
    </nav>
  );
}
