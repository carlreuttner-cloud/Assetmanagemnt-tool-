-- CreateEnum
CREATE TYPE "MassnahmeStatus" AS ENUM ('GEPLANT', 'LAUFEND', 'ABGESCHLOSSEN');

-- AlterTable
ALTER TABLE "Investition" ADD COLUMN     "massnahmeId" TEXT;

-- CreateTable
CREATE TABLE "Massnahme" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "hausId" TEXT NOT NULL,
    "einheitId" TEXT,
    "bezeichnung" TEXT NOT NULL,
    "kategorie" TEXT,
    "status" "MassnahmeStatus" NOT NULL DEFAULT 'GEPLANT',
    "budget" DECIMAL(14,2),
    "budgetQuelle" TEXT,
    "beginn" DATE,
    "ende" DATE,
    "mehrmieteMonat" DECIMAL(12,2),
    "mehrmieteBelegt" BOOLEAN NOT NULL DEFAULT false,
    "mehrmieteQuelle" TEXT,
    "notiz" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Massnahme_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Massnahme_mandantId_idx" ON "Massnahme"("mandantId");

-- CreateIndex
CREATE INDEX "Massnahme_hausId_idx" ON "Massnahme"("hausId");

-- CreateIndex
CREATE INDEX "Investition_massnahmeId_idx" ON "Investition"("massnahmeId");

-- AddForeignKey
ALTER TABLE "Investition" ADD CONSTRAINT "Investition_massnahmeId_fkey" FOREIGN KEY ("massnahmeId") REFERENCES "Massnahme"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Massnahme" ADD CONSTRAINT "Massnahme_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Massnahme" ADD CONSTRAINT "Massnahme_hausId_fkey" FOREIGN KEY ("hausId") REFERENCES "Haus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Massnahme" ADD CONSTRAINT "Massnahme_einheitId_fkey" FOREIGN KEY ("einheitId") REFERENCES "Einheit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
