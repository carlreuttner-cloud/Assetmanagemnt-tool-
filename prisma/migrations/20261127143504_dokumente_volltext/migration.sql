-- CreateEnum
CREATE TYPE "DokumentTextQuelle" AS ENUM ('PDF_TEXT', 'OCR', 'KEINE');

-- AlterTable
ALTER TABLE "Dokument" ADD COLUMN     "bestaetigt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dokumentDatum" DATE,
ADD COLUMN     "geaendertAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "hochgeladenVonId" TEXT,
ADD COLUMN     "jahr" INTEGER,
ADD COLUMN     "pruefsumme" TEXT,
ADD COLUMN     "seitenAnzahl" INTEGER,
ADD COLUMN     "textHinweis" TEXT,
ADD COLUMN     "textQuelle" "DokumentTextQuelle";

-- CreateTable
CREATE TABLE "DokumentSeite" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "dokumentId" TEXT NOT NULL,
    "nummer" INTEGER NOT NULL,
    "text" TEXT NOT NULL,

    CONSTRAINT "DokumentSeite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DokumentSeite_mandantId_idx" ON "DokumentSeite"("mandantId");

-- CreateIndex
CREATE UNIQUE INDEX "DokumentSeite_dokumentId_nummer_key" ON "DokumentSeite"("dokumentId", "nummer");

-- CreateIndex
CREATE INDEX "Dokument_mandantId_bestaetigt_idx" ON "Dokument"("mandantId", "bestaetigt");

-- AddForeignKey
ALTER TABLE "Dokument" ADD CONSTRAINT "Dokument_hochgeladenVonId_fkey" FOREIGN KEY ("hochgeladenVonId") REFERENCES "Benutzer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DokumentSeite" ADD CONSTRAINT "DokumentSeite_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DokumentSeite" ADD CONSTRAINT "DokumentSeite_dokumentId_fkey" FOREIGN KEY ("dokumentId") REFERENCES "Dokument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
