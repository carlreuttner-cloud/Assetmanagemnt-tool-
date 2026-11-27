-- CreateEnum
CREATE TYPE "PlanpositionArt" AS ENUM ('AUSSCHUETTUNG', 'EINNAHME', 'AUSGABE');

-- AlterTable
ALTER TABLE "Gesellschaft" ADD COLUMN     "mindestliquiditaet" DECIMAL(14,2);

-- CreateTable
CREATE TABLE "Bankkontostand" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "gesellschaftId" TEXT NOT NULL,
    "konto" TEXT NOT NULL,
    "stichtag" DATE NOT NULL,
    "betrag" DECIMAL(14,2) NOT NULL,
    "quelle" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bankkontostand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Planposition" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "gesellschaftId" TEXT NOT NULL,
    "art" "PlanpositionArt" NOT NULL,
    "monat" DATE NOT NULL,
    "betrag" DECIMAL(14,2) NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "quelle" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Planposition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Bankkontostand_mandantId_idx" ON "Bankkontostand"("mandantId");

-- CreateIndex
CREATE INDEX "Bankkontostand_gesellschaftId_idx" ON "Bankkontostand"("gesellschaftId");

-- CreateIndex
CREATE INDEX "Planposition_mandantId_idx" ON "Planposition"("mandantId");

-- CreateIndex
CREATE INDEX "Planposition_gesellschaftId_idx" ON "Planposition"("gesellschaftId");

-- AddForeignKey
ALTER TABLE "Bankkontostand" ADD CONSTRAINT "Bankkontostand_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bankkontostand" ADD CONSTRAINT "Bankkontostand_gesellschaftId_fkey" FOREIGN KEY ("gesellschaftId") REFERENCES "Gesellschaft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Planposition" ADD CONSTRAINT "Planposition_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Planposition" ADD CONSTRAINT "Planposition_gesellschaftId_fkey" FOREIGN KEY ("gesellschaftId") REFERENCES "Gesellschaft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
