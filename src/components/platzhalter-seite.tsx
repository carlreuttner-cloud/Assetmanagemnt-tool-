import { texte } from "@/i18n";

export function PlatzhalterSeite({ titel, beschreibung }: { titel: string; beschreibung: string }) {
  const t = texte();
  return (
    <div>
      <h1 className="text-2xl font-semibold">{titel}</h1>
      <p className="mt-1 text-slate-600">{beschreibung}</p>
      <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
        {t.seiten.platzhalter}
      </div>
    </div>
  );
}
