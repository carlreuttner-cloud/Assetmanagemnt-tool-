import { NextResponse, type NextRequest } from "next/server";
import { MANDANT_COOKIE } from "@/lib/auth/kontext";

/**
 * Beendet eine ungültige Sitzung (z. B. Benutzer nach neuem Seed nicht mehr vorhanden oder
 * deaktiviert): löscht die Sitzungs-Cookies und leitet zur Anmeldung weiter. Ohne diesen Schritt
 * würde die Anmeldeseite die alte Sitzung für gültig halten und zurückleiten (Endlosschleife).
 */
export function GET(request: NextRequest) {
  const antwort = NextResponse.redirect(new URL("/login?sitzung=abgelaufen", request.url));
  for (const c of request.cookies.getAll()) {
    if (/^(__Secure-|__Host-)?authjs\./.test(c.name) || c.name === MANDANT_COOKIE) {
      antwort.cookies.set(c.name, "", { path: "/", maxAge: 0, secure: c.name.startsWith("__"), httpOnly: true, sameSite: "lax" });
    }
  }
  return antwort;
}
