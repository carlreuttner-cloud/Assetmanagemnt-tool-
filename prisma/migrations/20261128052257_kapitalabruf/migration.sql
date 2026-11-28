-- AlterTable
ALTER TABLE "Kapitalbewegung" ADD COLUMN     "abrufPositionId" TEXT;

-- CreateTable
CREATE TABLE "Kapitalabruf" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "gesellschaftId" TEXT NOT NULL,
    "bezeichnung" TEXT NOT NULL,
    "abrufAm" DATE NOT NULL,
    "faelligAm" DATE NOT NULL,
    "gesamtbetrag" DECIMAL(14,2) NOT NULL,
    "notiz" TEXT,
    "erstelltVon" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Kapitalabruf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KapitalabrufPosition" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "abrufId" TEXT NOT NULL,
    "gesellschafterId" TEXT NOT NULL,
    "anteilProzent" DECIMAL(9,6) NOT NULL,
    "betrag" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "KapitalabrufPosition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Kapitalabruf_mandantId_gesellschaftId_idx" ON "Kapitalabruf"("mandantId", "gesellschaftId");

-- CreateIndex
CREATE INDEX "KapitalabrufPosition_mandantId_abrufId_idx" ON "KapitalabrufPosition"("mandantId", "abrufId");

-- AddForeignKey
ALTER TABLE "Kapitalbewegung" ADD CONSTRAINT "Kapitalbewegung_abrufPositionId_fkey" FOREIGN KEY ("abrufPositionId") REFERENCES "KapitalabrufPosition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kapitalabruf" ADD CONSTRAINT "Kapitalabruf_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kapitalabruf" ADD CONSTRAINT "Kapitalabruf_gesellschaftId_fkey" FOREIGN KEY ("gesellschaftId") REFERENCES "Gesellschaft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KapitalabrufPosition" ADD CONSTRAINT "KapitalabrufPosition_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KapitalabrufPosition" ADD CONSTRAINT "KapitalabrufPosition_abrufId_fkey" FOREIGN KEY ("abrufId") REFERENCES "Kapitalabruf"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KapitalabrufPosition" ADD CONSTRAINT "KapitalabrufPosition_gesellschafterId_fkey" FOREIGN KEY ("gesellschafterId") REFERENCES "Gesellschafter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
