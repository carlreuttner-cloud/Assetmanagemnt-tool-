-- CreateEnum
CREATE TYPE "BauteilArt" AS ENUM ('DACH', 'FASSADE', 'FENSTER', 'HEIZUNG', 'AUFZUG', 'LEITUNGEN', 'ELEKTRO', 'TREPPENHAUS', 'AUSSENANLAGEN', 'SONSTIGES');

-- AlterTable
ALTER TABLE "Planposition" ADD COLUMN     "bauteilId" TEXT;

-- CreateTable
CREATE TABLE "Bauteil" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "hausId" TEXT NOT NULL,
    "art" "BauteilArt" NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "zyklusJahre" INTEGER,
    "letzteErneuerung" INTEGER,
    "geplanteKosten" DECIMAL(14,2),
    "kostenQuelle" TEXT,
    "kostenStand" DATE,
    "notiz" TEXT,
    "erstelltVon" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bauteil_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Bauteil_mandantId_idx" ON "Bauteil"("mandantId");

-- CreateIndex
CREATE INDEX "Bauteil_hausId_idx" ON "Bauteil"("hausId");

-- CreateIndex
CREATE INDEX "Planposition_bauteilId_idx" ON "Planposition"("bauteilId");

-- AddForeignKey
ALTER TABLE "Planposition" ADD CONSTRAINT "Planposition_bauteilId_fkey" FOREIGN KEY ("bauteilId") REFERENCES "Bauteil"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bauteil" ADD CONSTRAINT "Bauteil_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bauteil" ADD CONSTRAINT "Bauteil_hausId_fkey" FOREIGN KEY ("hausId") REFERENCES "Haus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
