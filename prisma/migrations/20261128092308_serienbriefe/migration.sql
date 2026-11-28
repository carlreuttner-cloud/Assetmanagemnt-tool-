-- CreateEnum
CREATE TYPE "BriefvorlageArt" AS ENUM ('MIETERHOEHUNG', 'ALLGEMEIN');

-- AlterTable
ALTER TABLE "Dokument" ADD COLUMN     "briefserieId" TEXT;

-- CreateTable
CREATE TABLE "Briefvorlage" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "art" "BriefvorlageArt" NOT NULL,
    "betreff" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "erstelltVon" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Briefvorlage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Briefserie" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "briefvorlageId" TEXT,
    "art" "BriefvorlageArt" NOT NULL,
    "titel" TEXT NOT NULL,
    "datum" DATE NOT NULL,
    "betreff" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "prozent" DECIMAL(6,2),
    "erstelltVon" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Briefserie_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Briefvorlage_mandantId_idx" ON "Briefvorlage"("mandantId");

-- CreateIndex
CREATE INDEX "Briefserie_mandantId_idx" ON "Briefserie"("mandantId");

-- AddForeignKey
ALTER TABLE "Dokument" ADD CONSTRAINT "Dokument_briefserieId_fkey" FOREIGN KEY ("briefserieId") REFERENCES "Briefserie"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Briefvorlage" ADD CONSTRAINT "Briefvorlage_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Briefserie" ADD CONSTRAINT "Briefserie_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Briefserie" ADD CONSTRAINT "Briefserie_briefvorlageId_fkey" FOREIGN KEY ("briefvorlageId") REFERENCES "Briefvorlage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
