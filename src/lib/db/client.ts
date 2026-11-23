import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * Basis-Client OHNE Mandantenfilter.
 *
 * Nur für Anmeldung, Mandantenauswahl und Verwaltungsaufgaben verwenden.
 * Für alle fachlichen Daten `mandantDb()` aus `./mandant` benutzen.
 */
function erzeugeClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

const globalFuerPrisma = globalThis as unknown as { basisDb?: ReturnType<typeof erzeugeClient> };

export const basisDb = globalFuerPrisma.basisDb ?? erzeugeClient();

if (process.env.NODE_ENV !== "production") globalFuerPrisma.basisDb = basisDb;
