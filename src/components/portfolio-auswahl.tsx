"use client";

import { usePathname, useSearchParams } from "next/navigation";

/** Auswahl oben links: Generalübersicht, ein Portfolio oder "Ohne Portfolio"; wechselt sofort. */
export function PortfolioAuswahl({
  aktion,
  wert,
  optionen,
  label,
}: {
  aktion: (fd: FormData) => Promise<void>;
  wert: string;
  optionen: Array<{ wert: string; text: string }>;
  label: string;
}) {
  const pfad = usePathname();
  const suche = useSearchParams().toString();
  return (
    <form action={aktion} className="space-y-1">
      <label htmlFor="portfolio" className="block text-xs text-slate-400">
        {label}
      </label>
      <input type="hidden" name="zurueck" value={suche ? `${pfad}?${suche}` : pfad} />
      <select
        id="portfolio"
        name="portfolio"
        defaultValue={wert}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="w-full rounded bg-slate-800 px-2 py-1.5 text-sm text-slate-100"
      >
        {optionen.map((o) => (
          <option key={o.wert} value={o.wert}>
            {o.text}
          </option>
        ))}
      </select>
    </form>
  );
}
