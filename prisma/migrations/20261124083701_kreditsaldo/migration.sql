-- CreateEnum
CREATE TYPE "SaldoArt" AS ENUM ('DARLEHEN', 'GUTHABEN');

-- CreateEnum
CREATE TYPE "SaldoQuelle" AS ENUM ('KONTOAUSZUG', 'BANKBESTAETIGUNG', 'JAHRESABSCHLUSS', 'SONSTIGE');

-- CreateEnum
CREATE TYPE "SaldoStatus" AS ENUM ('BELEGT', 'ENTWURF');

-- CreateTable
CREATE TABLE "Kreditsaldo" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "kreditId" TEXT NOT NULL,
    "stichtag" DATE,
    "stichtagHinweis" TEXT,
    "art" "SaldoArt" NOT NULL DEFAULT 'DARLEHEN',
    "betrag" DECIMAL(14,2) NOT NULL,
    "quelle" "SaldoQuelle" NOT NULL,
    "quelleText" TEXT,
    "status" "SaldoStatus" NOT NULL DEFAULT 'BELEGT',
    "notiz" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kreditsaldo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Kreditsaldo_mandantId_idx" ON "Kreditsaldo"("mandantId");

-- CreateIndex
CREATE INDEX "Kreditsaldo_kreditId_stichtag_idx" ON "Kreditsaldo"("kreditId", "stichtag");

-- AddForeignKey
ALTER TABLE "Kreditsaldo" ADD CONSTRAINT "Kreditsaldo_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kreditsaldo" ADD CONSTRAINT "Kreditsaldo_kreditId_fkey" FOREIGN KEY ("kreditId") REFERENCES "Kredit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
