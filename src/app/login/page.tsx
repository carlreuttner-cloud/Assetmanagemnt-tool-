import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { texte } from "@/i18n";
import { LoginFormular } from "./login-formular";

export default async function LoginSeite() {
  const session = await auth();
  if (session?.user?.id) redirect("/");
  const t = texte();

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold">{t.app.titel}</h1>
        <p className="mt-1 text-sm text-slate-500">{t.login.titel}</p>
        <LoginFormular />
      </div>
    </main>
  );
}
