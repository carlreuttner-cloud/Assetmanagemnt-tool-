-- CreateEnum
CREATE TYPE "EnergieausweisArt" AS ENUM ('BEDARF', 'VERBRAUCH');

-- CreateEnum
CREATE TYPE "Energiemedium" AS ENUM ('WAERME', 'STROM', 'WASSER');

-- CreateTable
CREATE TABLE "Energieausweis" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "hausId" TEXT NOT NULL,
    "art" "EnergieausweisArt" NOT NULL,
    "energieklasse" TEXT,
    "endenergie" DECIMAL(9,2),
    "primaerenergie" DECIMAL(9,2),
    "energietraeger" TEXT,
    "ausgestelltAm" DATE,
    "gueltigBis" DATE,
    "registriernummer" TEXT,
    "quelle" TEXT,
    "notiz" TEXT,
    "erstelltVon" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Energieausweis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Energieverbrauch" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "hausId" TEXT NOT NULL,
    "jahr" INTEGER NOT NULL,
    "medium" "Energiemedium" NOT NULL,
    "menge" DECIMAL(14,2) NOT NULL,
    "kosten" DECIMAL(14,2),
    "co2Kg" DECIMAL(14,2),
    "energietraeger" TEXT,
    "quelle" TEXT NOT NULL,
    "notiz" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Energieverbrauch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Energieausweis_mandantId_idx" ON "Energieausweis"("mandantId");

-- CreateIndex
CREATE INDEX "Energieausweis_hausId_idx" ON "Energieausweis"("hausId");

-- CreateIndex
CREATE INDEX "Energieverbrauch_mandantId_idx" ON "Energieverbrauch"("mandantId");

-- CreateIndex
CREATE UNIQUE INDEX "Energieverbrauch_hausId_jahr_medium_key" ON "Energieverbrauch"("hausId", "jahr", "medium");

-- AddForeignKey
ALTER TABLE "Energieausweis" ADD CONSTRAINT "Energieausweis_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Energieausweis" ADD CONSTRAINT "Energieausweis_hausId_fkey" FOREIGN KEY ("hausId") REFERENCES "Haus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Energieverbrauch" ADD CONSTRAINT "Energieverbrauch_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Energieverbrauch" ADD CONSTRAINT "Energieverbrauch_hausId_fkey" FOREIGN KEY ("hausId") REFERENCES "Haus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
