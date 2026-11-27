import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { SITZUNG_BEENDEN } from "@/lib/auth/kontext";
import { basisDb } from "@/lib/db/client";
import { texte } from "@/i18n";
import { LoginFormular } from "./login-formular";

export default async function LoginSeite({ searchParams }: PageProps<"/login">) {
  const session = await auth();
  const benutzerId = session?.user?.id;
  if (benutzerId) {
    // Nur weiterleiten, wenn der Benutzer der Sitzung noch existiert und aktiv ist
    const benutzer = await basisDb.benutzer.findUnique({ where: { id: benutzerId }, select: { aktiv: true } });
    redirect(benutzer?.aktiv ? "/" : SITZUNG_BEENDEN);
  }
  const t = texte();
  const abgelaufen = (await searchParams).sitzung === "abgelaufen";

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">{t.app.titel}</h1>
        <p className="mt-1 text-sm text-slate-500">{t.login.titel}</p>
        {abgelaufen && <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t.login.sitzungAbgelaufen}</p>}
        <LoginFormular />
      </div>
    </main>
  );
}
