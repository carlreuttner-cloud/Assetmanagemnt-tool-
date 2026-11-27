"use client";

/**
 * Auswahlliste (Dropdown) als Filter: jede Option ist ein Link; beim Wechsel wird die Seite mit
 * dem neuen Filter geladen. Ersetzt Klickleisten, wenn es viele Einträge gibt (z. B. 40+
 * Gesellschaften).
 */
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";

export type AuswahlOption = { href: string; text: string; aktiv: boolean; gruppe?: string };

export function AuswahlFilter({ label, optionen, name }: { label: string; optionen: AuswahlOption[]; name: string }) {
  const router = useRouter();
  const [laedt, starte] = useTransition();
  const aktiv = optionen.find((o) => o.aktiv) ?? optionen[0];
  const gruppen = [...new Set(optionen.map((o) => o.gruppe ?? ""))];
  const eintrag = (o: AuswahlOption) => (
    <option key={o.href} value={o.href}>
      {o.text}
    </option>
  );
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-slate-600" data-auswahl-filter={name}>
      {label}
      <select
        name={name}
        value={aktiv?.href}
        disabled={laedt}
        onChange={(e) => {
          const ziel = e.target.value;
          starte(() => router.push(ziel));
        }}
        className="min-w-64 max-w-full rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-normal text-slate-900 disabled:opacity-60"
      >
        {gruppen.length > 1
          ? gruppen.map((g) =>
              g ? (
                <optgroup key={g} label={g}>
                  {optionen.filter((o) => o.gruppe === g).map(eintrag)}
                </optgroup>
              ) : (
                optionen.filter((o) => !o.gruppe).map(eintrag)
              ),
            )
          : optionen.map(eintrag)}
      </select>
    </label>
  );
}

/** Mehrere Filter nebeneinander. */
export function FilterZeile({ children }: { children: ReactNode }) {
  return <div className="mb-4 flex flex-wrap items-end gap-3">{children}</div>;
}
