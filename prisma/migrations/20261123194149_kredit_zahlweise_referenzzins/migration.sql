-- CreateEnum
CREATE TYPE "Zahlweise" AS ENUM ('MONATLICH', 'QUARTALSWEISE', 'HALBJAEHRLICH', 'JAEHRLICH');

-- CreateEnum
CREATE TYPE "Tilgungsart" AS ENUM ('ANNUITAET', 'RATENTILGUNG', 'ENDFAELLIG');

-- AlterTable
ALTER TABLE "Kredit" ADD COLUMN     "anfaenglicheTilgung" DECIMAL(9,6),
ADD COLUMN     "ratenbetrag" DECIMAL(14,2),
ADD COLUMN     "tilgungsart" "Tilgungsart" NOT NULL DEFAULT 'ANNUITAET',
ADD COLUMN     "zahlweise" "Zahlweise" NOT NULL DEFAULT 'MONATLICH';

-- CreateTable
CREATE TABLE "Referenzzinssatz" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "referenz" TEXT NOT NULL,
    "stichtag" DATE NOT NULL,
    "satz" DECIMAL(9,6) NOT NULL,
    "quelle" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referenzzinssatz_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Referenzzinssatz_mandantId_idx" ON "Referenzzinssatz"("mandantId");

-- CreateIndex
CREATE UNIQUE INDEX "Referenzzinssatz_mandantId_referenz_stichtag_key" ON "Referenzzinssatz"("mandantId", "referenz", "stichtag");

-- AddForeignKey
ALTER TABLE "Referenzzinssatz" ADD CONSTRAINT "Referenzzinssatz_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
