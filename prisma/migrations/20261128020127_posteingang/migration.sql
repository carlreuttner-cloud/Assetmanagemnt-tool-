-- CreateEnum
CREATE TYPE "EingangQuelle" AS ENUM ('HOCHLADEN', 'UPLOAD_LINK', 'EMAIL');

-- CreateEnum
CREATE TYPE "EingangStatus" AS ENUM ('ZU_PRUEFEN', 'UNSICHER', 'QUARANTAENE', 'UEBERNOMMEN', 'ABGELEHNT');

-- CreateEnum
CREATE TYPE "RegelMerkmal" AS ENUM ('IBAN', 'KENNUNG', 'ABSENDER_ADRESSE', 'ABSENDER_NAME');

-- CreateTable
CREATE TABLE "Eingang" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "quelle" "EingangQuelle" NOT NULL,
    "status" "EingangStatus" NOT NULL,
    "dateiname" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "groesseBytes" INTEGER NOT NULL,
    "speicherPfad" TEXT NOT NULL,
    "pruefsumme" TEXT NOT NULL,
    "seiten" JSONB,
    "textQuelle" "DokumentTextQuelle",
    "textHinweis" TEXT,
    "seitenAnzahl" INTEGER,
    "absenderAdresse" TEXT,
    "absenderHinweis" TEXT,
    "betreff" TEXT,
    "mailtext" TEXT,
    "vorschlag" JSONB,
    "hochgeladenVonId" TEXT,
    "dokumentId" TEXT,
    "bearbeitetVonId" TEXT,
    "bearbeitetAm" TIMESTAMP(3),
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Eingang_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Zuordnungsregel" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "merkmal" "RegelMerkmal" NOT NULL,
    "wert" TEXT NOT NULL,
    "gesellschaftId" TEXT,
    "hausId" TEXT,
    "kreditId" TEXT,
    "absenderArt" "AbsenderArt",
    "absenderName" TEXT,
    "anzahl" INTEGER NOT NULL DEFAULT 1,
    "erstelltVonId" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Zuordnungsregel_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Eingang_dokumentId_key" ON "Eingang"("dokumentId");

-- CreateIndex
CREATE INDEX "Eingang_mandantId_status_idx" ON "Eingang"("mandantId", "status");

-- CreateIndex
CREATE INDEX "Eingang_mandantId_pruefsumme_idx" ON "Eingang"("mandantId", "pruefsumme");

-- CreateIndex
CREATE UNIQUE INDEX "Zuordnungsregel_mandantId_merkmal_wert_key" ON "Zuordnungsregel"("mandantId", "merkmal", "wert");

-- AddForeignKey
ALTER TABLE "Eingang" ADD CONSTRAINT "Eingang_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Eingang" ADD CONSTRAINT "Eingang_dokumentId_fkey" FOREIGN KEY ("dokumentId") REFERENCES "Dokument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Zuordnungsregel" ADD CONSTRAINT "Zuordnungsregel_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Zuordnungsregel" ADD CONSTRAINT "Zuordnungsregel_gesellschaftId_fkey" FOREIGN KEY ("gesellschaftId") REFERENCES "Gesellschaft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Zuordnungsregel" ADD CONSTRAINT "Zuordnungsregel_hausId_fkey" FOREIGN KEY ("hausId") REFERENCES "Haus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Zuordnungsregel" ADD CONSTRAINT "Zuordnungsregel_kreditId_fkey" FOREIGN KEY ("kreditId") REFERENCES "Kredit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
