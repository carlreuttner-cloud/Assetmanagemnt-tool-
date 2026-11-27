import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { basisDb } from "@/lib/db/client";
import { mandantDb } from "@/lib/db/mandant";
import type { Rolle } from "@/generated/prisma/enums";
import { darf, startseite, type Aktion, type Bereich } from "./rechte";

export const MANDANT_COOKIE = "aktiver_mandant";
/** Löscht eine ungültige Sitzung und leitet zur Anmeldung (siehe app/api/sitzung-beenden). */
export const SITZUNG_BEENDEN = "/api/sitzung-beenden";

export type Kontext = {
  benutzer: { id: string; name: string; email: string };
  mandant: { id: string; name: string; waehrung: string; sprache: string };
  rolle: Rolle;
  mitgliedschaftId: string;
  /** Alle Mandanten des Benutzers, für den Mandantenwechsel. */
  mandanten: Array<{ id: string; name: string; rolle: Rolle }>;
  /** Datenbankzugriff, fest auf den aktiven Mandanten beschränkt. */
  db: ReturnType<typeof mandantDb>;
};

/**
 * Liefert angemeldeten Benutzer, aktiven Mandanten und Rolle.
 * Leitet zur Anmeldung um, wenn niemand angemeldet ist.
 * Wird pro Anfrage nur einmal ausgeführt (React `cache`).
 */
export const getKontext = cache(async (): Promise<Kontext> => {
  const session = await auth();
  const benutzerId = session?.user?.id;
  if (!benutzerId) redirect("/login");

  const benutzer = await basisDb.benutzer.findUnique({
    where: { id: benutzerId },
    include: {
      mitgliedschaften: {
        include: { mandant: true },
        orderBy: { mandant: { name: "asc" } },
      },
    },
  });
  // Sitzung zeigt auf einen gelöschten oder deaktivierten Benutzer (z. B. nach neuem Seed):
  // Cookies löschen, sonst leitet /login wegen der „Sitzung“ zurück (Endlosschleife).
  if (!benutzer || !benutzer.aktiv) redirect(SITZUNG_BEENDEN);
  if (benutzer.mitgliedschaften.length === 0) redirect("/kein-mandant");

  const gewuenscht = (await cookies()).get(MANDANT_COOKIE)?.value;
  const mitgliedschaft =
    benutzer.mitgliedschaften.find((m) => m.mandantId === gewuenscht) ??
    benutzer.mitgliedschaften[0];
  const mandant = mitgliedschaft.mandant;

  return {
    benutzer: { id: benutzer.id, name: benutzer.name, email: benutzer.email },
    mandant: {
      id: mandant.id,
      name: mandant.name,
      waehrung: mandant.waehrung,
      sprache: benutzer.sprache ?? mandant.sprache,
    },
    rolle: mitgliedschaft.rolle,
    mitgliedschaftId: mitgliedschaft.id,
    mandanten: benutzer.mitgliedschaften.map((m) => ({
      id: m.mandantId,
      name: m.mandant.name,
      rolle: m.rolle,
    })),
    db: mandantDb({ mandantId: mandant.id, benutzerId: benutzer.id }),
  };
});

/** Für Seiten und Server-Aktionen: bricht ab, wenn die Rolle den Bereich nicht darf. */
export async function pruefeZugriff(bereich: Bereich, aktion: Aktion = "lesen"): Promise<Kontext> {
  const kontext = await getKontext();
  if (!darf(kontext.rolle, bereich, aktion)) redirect(startseite(kontext.rolle));
  return kontext;
}
