import type { Texte } from "@/i18n";

/** Optionen für den Filter „Hausverwaltung“ in allen Listen. */
export function hvOptionen(verwaltungen: Array<{ id: string; name: string }>, aktiv: string | undefined, href: (wert: string | undefined) => string, t: Texte) {
  const th = t.hausverwaltungen;
  return [
    { href: href(undefined), text: th.alle, aktiv: !aktiv },
    ...verwaltungen.map((v) => ({ href: href(v.id), text: v.name, aktiv: aktiv === v.id })),
    { href: href("ohne"), text: th.ohne, aktiv: aktiv === "ohne" },
  ];
}
