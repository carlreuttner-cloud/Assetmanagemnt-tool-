"use server";

import { AuthError } from "next-auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/auth";
import { getKontext, MANDANT_COOKIE } from "@/lib/auth/kontext";
import { startseite } from "@/lib/auth/rechte";
import { texte } from "@/i18n";

export type AnmeldeStatus = { fehler?: string };

export async function anmelden(_vorher: AnmeldeStatus, formular: FormData): Promise<AnmeldeStatus> {
  try {
    await signIn("credentials", {
      email: formular.get("email"),
      passwort: formular.get("passwort"),
      redirectTo: "/",
    });
  } catch (fehler) {
    if (fehler instanceof AuthError) return { fehler: texte().login.fehler };
    throw fehler; // Umleitung nach erfolgreicher Anmeldung
  }
  return {};
}

export async function abmelden() {
  (await cookies()).delete(MANDANT_COOKIE);
  await signOut({ redirectTo: "/login" });
}

export async function mandantWechseln(formular: FormData) {
  const mandantId = String(formular.get("mandantId") ?? "");
  const kontext = await getKontext();
  const ziel = kontext.mandanten.find((m) => m.id === mandantId);
  if (!ziel) throw new Error("Kein Zugriff auf diesen Mandanten");

  (await cookies()).set(MANDANT_COOKIE, mandantId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  redirect(startseite(ziel.rolle));
}
