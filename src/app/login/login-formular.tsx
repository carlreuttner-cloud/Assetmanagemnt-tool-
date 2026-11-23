"use client";

import { useActionState } from "react";
import { anmelden, type AnmeldeStatus } from "@/app/aktionen";
import { texte } from "@/i18n";

const t = texte();

export function LoginFormular() {
  const [status, aktion, laeuft] = useActionState<AnmeldeStatus, FormData>(anmelden, {});

  return (
    <form action={aktion} className="mt-6 space-y-4">
      <label className="block">
        <span className="text-sm font-medium">{t.login.email}</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium">{t.login.passwort}</span>
        <input
          name="passwort"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
        />
      </label>
      {status.fehler && (
        <p role="alert" className="text-sm text-red-600">
          {status.fehler}
        </p>
      )}
      <button
        type="submit"
        disabled={laeuft}
        className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
      >
        {t.login.absenden}
      </button>
    </form>
  );
}
