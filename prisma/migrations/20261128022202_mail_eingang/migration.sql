-- CreateEnum
CREATE TYPE "MailErgebnis" AS ENUM ('AUFGENOMMEN', 'QUARANTAENE', 'OHNE_ANHANG', 'DOPPELT', 'FEHLER');

-- AlterTable
ALTER TABLE "Eingang" ADD COLUMN     "eingangMailId" TEXT;

-- CreateTable
CREATE TABLE "MailPostfach" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "kennung" TEXT NOT NULL,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailPostfach_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailAbsender" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "adresse" TEXT NOT NULL,
    "name" TEXT,
    "absenderArt" "AbsenderArt",
    "erstelltVonId" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailAbsender_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EingangMail" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "von" TEXT NOT NULL,
    "vonName" TEXT,
    "betreff" TEXT,
    "nachrichtId" TEXT,
    "pruefung" TEXT,
    "ergebnis" "MailErgebnis" NOT NULL,
    "hinweis" TEXT,
    "anzahlAnhaenge" INTEGER NOT NULL DEFAULT 0,
    "aufgenommen" INTEGER NOT NULL DEFAULT 0,
    "groesseBytes" INTEGER NOT NULL DEFAULT 0,
    "empfangenAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EingangMail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MailPostfach_mandantId_key" ON "MailPostfach"("mandantId");

-- CreateIndex
CREATE UNIQUE INDEX "MailPostfach_kennung_key" ON "MailPostfach"("kennung");

-- CreateIndex
CREATE UNIQUE INDEX "MailAbsender_mandantId_adresse_key" ON "MailAbsender"("mandantId", "adresse");

-- CreateIndex
CREATE INDEX "EingangMail_mandantId_empfangenAm_idx" ON "EingangMail"("mandantId", "empfangenAm");

-- AddForeignKey
ALTER TABLE "Eingang" ADD CONSTRAINT "Eingang_eingangMailId_fkey" FOREIGN KEY ("eingangMailId") REFERENCES "EingangMail"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailPostfach" ADD CONSTRAINT "MailPostfach_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailAbsender" ADD CONSTRAINT "MailAbsender_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EingangMail" ADD CONSTRAINT "EingangMail_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
