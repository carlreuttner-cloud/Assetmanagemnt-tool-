/**
 * Testdaten Plan/Ist: Elbufer 2024 (Ist endgültig, Materialaufwand deutlich über Plan, erklärt; Umsatz
 * unter Plan, noch nicht erklärt), Lindenhof 2025 (Ist ist Entwurf), Mainhaus 2026 (noch kein Ist).
 */
import type { PrismaClient } from "../../src/generated/prisma/client";
import { GUV_POSTEN } from "../../src/lib/finanzen";
import { dezimal } from "../../src/lib/geld";
import { zeilenwerte, type PlanWerte } from "../../src/lib/plan-ist";

/** Planergebnis rechnerisch = EBT − Steuern, damit der Plan in sich aufgeht. */
function jahresergebnis(w: Record<string, string | null>): string | null {
  const z = zeilenwerte(Object.fromEntries(GUV_POSTEN.map((k) => [k, w[k] === null ? null : dezimal(w[k]!)])) as PlanWerte);
  return z.ebt === null || z.steuern === null ? null : z.ebt.minus(z.steuern).toFixed(2);
}

type Faktoren = Partial<Record<(typeof GUV_POSTEN)[number], number>>;

export async function bauePlanIst(db: PrismaClient, mandantId: string) {
  const plaene: Array<{ name: string; jahr: number; basisJahr: number; faktoren: Faktoren; status: "ENTWURF" | "BESCHLOSSEN"; beschlossenAm?: string; quelle?: string; erklaerungen?: Record<string, string> }> = [
    {
      name: "Elbufer",
      jahr: 2024,
      basisJahr: 2024,
      faktoren: { umsatzerloese: 1.06, materialaufwand: 0.8, zinsaufwendungen: 1.01 },
      status: "BESCHLOSSEN",
      beschlossenAm: "2023-12-14",
      quelle: "Budget 2024, Gesellschafterbeschluss (Testdaten)",
      erklaerungen: { materialaufwand: "Außerplanmäßige Dachreparatur Haus Elbufer nach Sturmschaden (Testdaten)." },
    },
    { name: "Lindenhof", jahr: 2025, basisJahr: 2025, faktoren: { umsatzerloese: 1.01, materialaufwand: 0.97 }, status: "BESCHLOSSEN", beschlossenAm: "2024-12-10", quelle: "Budget 2025 (Testdaten)" },
    { name: "Mainhaus", jahr: 2026, basisJahr: 2025, faktoren: { umsatzerloese: 1.02, materialaufwand: 1.02, sonstigeAufwendungen: 1.02 }, status: "ENTWURF", quelle: "Budgetentwurf 2026 (Testdaten)" },
  ];
  for (const p of plaene) {
    const g = await db.gesellschaft.findFirst({ where: { mandantId, name: { startsWith: p.name } }, select: { id: true } });
    if (!g) continue;
    const basis = await db.geschaeftsjahr.findFirst({ where: { gesellschaftId: g.id, jahr: p.basisJahr } });
    if (!basis) continue;
    const werte = Object.fromEntries(
      GUV_POSTEN.map((k) => [k, basis[k] === null ? null : dezimal(basis[k]!.toString()).times(p.faktoren[k] ?? 1).dividedBy(1000).toDecimalPlaces(0).times(1000).toFixed(2)]),
    );
    const plan = await db.planjahr.create({
      data: {
        mandantId, gesellschaftId: g.id, jahr: p.jahr, status: p.status, quelle: p.quelle,
        beschlossenAm: p.beschlossenAm ? new Date(`${p.beschlossenAm}T00:00:00Z`) : null, erstelltVon: "Testdaten", ...werte,
        jahresergebnis: jahresergebnis(werte),
      },
    });
    for (const [zeile, text] of Object.entries(p.erklaerungen ?? {})) {
      await db.planerklaerung.create({ data: { mandantId, planjahrId: plan.id, zeile, text, erstelltVon: "Testdaten" } });
    }
  }
}
