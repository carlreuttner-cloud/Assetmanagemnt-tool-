-- CreateEnum
CREATE TYPE "KiAnalyseStatus" AS ENUM ('ERFOLGREICH', 'FEHLER');

-- CreateTable
CREATE TABLE "KiAnalyse" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "gesellschaftId" TEXT NOT NULL,
    "benutzerId" TEXT,
    "stichtag" DATE NOT NULL,
    "schwerpunkt" TEXT,
    "modell" TEXT NOT NULL,
    "status" "KiAnalyseStatus" NOT NULL,
    "datenpaket" JSONB NOT NULL,
    "ergebnis" JSONB,
    "fehler" TEXT,
    "tokensEingabe" INTEGER,
    "tokensAusgabe" INTEGER,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KiAnalyse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KiAnalyse_mandantId_idx" ON "KiAnalyse"("mandantId");

-- CreateIndex
CREATE INDEX "KiAnalyse_gesellschaftId_idx" ON "KiAnalyse"("gesellschaftId");

-- AddForeignKey
ALTER TABLE "KiAnalyse" ADD CONSTRAINT "KiAnalyse_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KiAnalyse" ADD CONSTRAINT "KiAnalyse_gesellschaftId_fkey" FOREIGN KEY ("gesellschaftId") REFERENCES "Gesellschaft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KiAnalyse" ADD CONSTRAINT "KiAnalyse_benutzerId_fkey" FOREIGN KEY ("benutzerId") REFERENCES "Benutzer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
