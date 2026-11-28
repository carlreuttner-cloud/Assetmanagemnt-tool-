import type { Decimal } from "@/lib/geld";
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

/**
 * Teilt eine Reihe in Abschnitte aus vollständigen Ständen (durchgezogen) und aus Ständen mit nur
 * Leerstandsdaten (gestrichelt, Mindestwerte). Der Übergangspunkt gehört zu beiden Abschnitten.
 */
export function geteilteReihen<P extends { x: string; y: Decimal | null; nurLeerstand: boolean }>(name: string, farbe: string, punkte: P[], zusatz: string) {
  const nurNah = (i: number) => punkte[i].nurLeerstand || !!punkte[i - 1]?.nurLeerstand || !!punkte[i + 1]?.nurLeerstand;
  return [
    { name, farbe, punkte: punkte.map((p) => ({ x: p.x, y: p.nurLeerstand ? null : p.y })) },
    ...(punkte.some((p) => p.nurLeerstand) ? [{ name: `${name} (${zusatz})`, farbe, gestrichelt: true, punkte: punkte.map((p, i) => ({ x: p.x, y: nurNah(i) ? p.y : null })) }] : []),
  ];
}
