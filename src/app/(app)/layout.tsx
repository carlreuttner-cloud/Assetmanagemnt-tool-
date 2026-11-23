import { abmelden, mandantWechseln } from "@/app/aktionen";
import { SeitenleistenNavigation } from "@/components/seitenleiste";
import { texte } from "@/i18n";
import { getKontext } from "@/lib/auth/kontext";
import { darf } from "@/lib/auth/rechte";
import { NAVIGATION } from "@/lib/navigation";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const kontext = await getKontext();
  const t = texte(kontext.mandant.sprache);
  const links = NAVIGATION.filter((e) => darf(kontext.rolle, e.bereich)).map((e) => ({
    pfad: e.pfad,
    text: t.navigation[e.textSchluessel],
  }));

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-64 shrink-0 flex-col bg-slate-900 p-4 text-white">
        <div className="mb-6 px-3">
          <div className="text-sm font-semibold">{t.app.titel}</div>
          <div className="mt-1 text-xs text-slate-400">{kontext.mandant.name}</div>
        </div>

        <SeitenleistenNavigation links={links} />

        <div className="mt-auto space-y-3 border-t border-slate-800 px-3 pt-4 text-xs text-slate-400">
          {kontext.mandanten.length > 1 && (
            <form action={mandantWechseln} className="space-y-1">
              <label htmlFor="mandantId" className="block">{t.konto.mandant}</label>
              <div className="flex gap-1">
                <select
                  id="mandantId"
                  name="mandantId"
                  defaultValue={kontext.mandant.id}
                  className="min-w-0 flex-1 rounded bg-slate-800 px-2 py-1 text-slate-100"
                >
                  {kontext.mandanten.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
                <button className="rounded bg-slate-700 px-2 py-1 text-slate-100 hover:bg-slate-600">OK</button>
              </div>
            </form>
          )}
          <div>
            <div className="text-slate-200">{kontext.benutzer.name}</div>
            <div>{t.rollen[kontext.rolle]}</div>
          </div>
          <form action={abmelden}>
            <button className="hover:text-white">{t.konto.abmelden}</button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-8">{children}</main>
    </div>
  );
}
