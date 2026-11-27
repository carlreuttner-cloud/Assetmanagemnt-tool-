import { Reiter } from "@/components/ui";
import type { Texte } from "@/i18n";
import type { Kontext } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";

/** Reiterzeile im Bereich „Dateien und Importe“: Mieterliste, Kreditbuchungen, Dokumente (je nach Recht). */
export function ImportReiter({ kontext, t, aktiv }: { kontext: Kontext; t: Texte; aktiv: "mieter" | "kredite" | "dokumente" }) {
  const r = kontext.rolle;
  const eintraege = [
    ...(darf(r, "import", "schreiben") ? [{ href: "/import", text: t.importe.mieterliste, aktiv: aktiv === "mieter" }] : []),
    ...(darf(r, "import", "schreiben") && darf(r, "gesellschaften", "schreiben")
      ? [{ href: "/import?art=kredite", text: t.importe.kreditbuchungen, aktiv: aktiv === "kredite" }]
      : []),
    ...(darf(r, "dokumente") ? [{ href: "/import/dokumente", text: t.dateien.reiter, aktiv: aktiv === "dokumente" }] : []),
  ];
  if (eintraege.length < 2) return null;
  return <Reiter eintraege={eintraege} />;
}
