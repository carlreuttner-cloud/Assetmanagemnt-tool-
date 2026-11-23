import { abmelden } from "@/app/aktionen";
import { texte } from "@/i18n";

export default function KeinMandant() {
  const t = texte();
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md rounded-xl border border-slate-200 bg-white p-8 text-sm shadow-sm">
        <p>{t.konto.keinMandant}</p>
        <form action={abmelden} className="mt-4">
          <button className="text-slate-600 underline">{t.konto.abmelden}</button>
        </form>
      </div>
    </main>
  );
}
