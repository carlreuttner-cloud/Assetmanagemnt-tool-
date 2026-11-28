/**
 * Testdaten: Sondertilgungsrechte. Festzinskredite meist 5 % des Ursprungsbetrags je Kalenderjahr,
 * einzelne Abweichungen (fester Betrag, Vertragsjahr, übertragbar, kein Recht) und bewusst
 * nicht erfasste Rechte, damit die Datenlücke sichtbar ist.
 */
import type { PrismaClient } from "../../src/generated/prisma/client";

type Recht = { recht: "KEINES" | "PROZENT" | "BETRAG"; wert?: string; jahr?: "KALENDERJAHR" | "VERTRAGSJAHR"; uebertragbar?: boolean };

const ABWEICHUNGEN: Record<string, Recht | null> = {
  K01: { recht: "BETRAG", wert: "100000", jahr: "VERTRAGSJAHR", uebertragbar: true },
  K05: { recht: "KEINES" },
  K14: { recht: "PROZENT", wert: "10" },
  K13: { recht: "PROZENT", wert: "10" },
  // nicht erfasst (Datenlücke)
  K20: null,
  K22: null,
};

export async function baueSondertilgungen(db: PrismaClient, mandantId: string) {
  const kredite = await db.kredit.findMany({ where: { mandantId }, select: { id: true, bezeichnung: true, zinsArt: true } });
  for (const k of kredite) {
    const schluessel = /\((K\d+)\)$/.exec(k.bezeichnung)?.[1] ?? "";
    const r = schluessel in ABWEICHUNGEN ? ABWEICHUNGEN[schluessel] : k.zinsArt === "FEST" ? { recht: "PROZENT" as const, wert: "5" } : null;
    if (!r) continue;
    await db.kredit.update({
      where: { id: k.id },
      data: { sondertilgungRecht: r.recht, sondertilgungWert: r.wert ?? null, sondertilgungJahr: r.jahr ?? "KALENDERJAHR", sondertilgungUebertragbar: r.uebertragbar ?? false },
    });
  }
}
