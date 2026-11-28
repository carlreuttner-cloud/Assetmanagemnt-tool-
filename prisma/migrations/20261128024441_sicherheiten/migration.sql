-- CreateEnum
CREATE TYPE "SicherheitArt" AS ENUM ('GRUNDSCHULD', 'HYPOTHEK', 'BUERGSCHAFT', 'ABTRETUNG_MIETEN', 'ABTRETUNG_SONSTIGE', 'VERPFAENDUNG', 'PATRONATSERKLAERUNG', 'SONSTIGE');

-- CreateEnum
CREATE TYPE "SicherheitQuelle" AS ENUM ('GRUNDBUCHAUSZUG', 'SICHERUNGSVERTRAG', 'BANKBESTAETIGUNG', 'SONSTIGE');

-- CreateTable
CREATE TABLE "Sicherheit" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "art" "SicherheitArt" NOT NULL,
    "glaeubiger" TEXT NOT NULL,
    "betrag" DECIMAL(14,2),
    "rang" INTEGER,
    "fundstelle" TEXT,
    "sicherungsgeber" TEXT,
    "gesellschaftId" TEXT,
    "eingetragenAm" DATE,
    "gueltigBis" DATE,
    "geloeschtAm" DATE,
    "quelle" "SicherheitQuelle" NOT NULL DEFAULT 'SONSTIGE',
    "stand" DATE,
    "dokumentId" TEXT,
    "notiz" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sicherheit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SicherheitHaus" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "sicherheitId" TEXT NOT NULL,
    "hausId" TEXT NOT NULL,

    CONSTRAINT "SicherheitHaus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SicherheitKredit" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "sicherheitId" TEXT NOT NULL,
    "kreditId" TEXT NOT NULL,

    CONSTRAINT "SicherheitKredit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Sicherheit_mandantId_idx" ON "Sicherheit"("mandantId");

-- CreateIndex
CREATE UNIQUE INDEX "SicherheitHaus_sicherheitId_hausId_key" ON "SicherheitHaus"("sicherheitId", "hausId");

-- CreateIndex
CREATE UNIQUE INDEX "SicherheitKredit_sicherheitId_kreditId_key" ON "SicherheitKredit"("sicherheitId", "kreditId");

-- AddForeignKey
ALTER TABLE "Sicherheit" ADD CONSTRAINT "Sicherheit_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sicherheit" ADD CONSTRAINT "Sicherheit_gesellschaftId_fkey" FOREIGN KEY ("gesellschaftId") REFERENCES "Gesellschaft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sicherheit" ADD CONSTRAINT "Sicherheit_dokumentId_fkey" FOREIGN KEY ("dokumentId") REFERENCES "Dokument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SicherheitHaus" ADD CONSTRAINT "SicherheitHaus_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SicherheitHaus" ADD CONSTRAINT "SicherheitHaus_sicherheitId_fkey" FOREIGN KEY ("sicherheitId") REFERENCES "Sicherheit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SicherheitHaus" ADD CONSTRAINT "SicherheitHaus_hausId_fkey" FOREIGN KEY ("hausId") REFERENCES "Haus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SicherheitKredit" ADD CONSTRAINT "SicherheitKredit_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SicherheitKredit" ADD CONSTRAINT "SicherheitKredit_sicherheitId_fkey" FOREIGN KEY ("sicherheitId") REFERENCES "Sicherheit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SicherheitKredit" ADD CONSTRAINT "SicherheitKredit_kreditId_fkey" FOREIGN KEY ("kreditId") REFERENCES "Kredit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
