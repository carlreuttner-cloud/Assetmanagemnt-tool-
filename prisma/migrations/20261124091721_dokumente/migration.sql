-- CreateEnum
CREATE TYPE "DokumentBezug" AS ENUM ('GESELLSCHAFT', 'HAUS', 'KREDIT');

-- CreateEnum
CREATE TYPE "DokumentAutomatik" AS ENUM ('GUTACHTEN', 'JAHRESABSCHLUSS', 'SALDENBESTAETIGUNG');

-- CreateTable
CREATE TABLE "Dokumentvorgabe" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bezug" "DokumentBezug" NOT NULL,
    "gueltigMonate" INTEGER,
    "automatik" "DokumentAutomatik",
    "beschreibung" TEXT,
    "reihenfolge" INTEGER NOT NULL DEFAULT 0,
    "aktiv" BOOLEAN NOT NULL DEFAULT true,
    "angelegtAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dokumentvorgabe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dokumentnachweis" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "vorgabeId" TEXT NOT NULL,
    "gesellschaftId" TEXT,
    "hausId" TEXT,
    "kreditId" TEXT,
    "vorhanden" BOOLEAN NOT NULL,
    "nichtErforderlich" BOOLEAN NOT NULL DEFAULT false,
    "dokumentDatum" DATE,
    "ablageort" TEXT,
    "notiz" TEXT,
    "geaendertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dokumentnachweis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Dokumentvorgabe_mandantId_idx" ON "Dokumentvorgabe"("mandantId");

-- CreateIndex
CREATE UNIQUE INDEX "Dokumentvorgabe_mandantId_bezug_name_key" ON "Dokumentvorgabe"("mandantId", "bezug", "name");

-- CreateIndex
CREATE INDEX "Dokumentnachweis_mandantId_idx" ON "Dokumentnachweis"("mandantId");

-- CreateIndex
CREATE INDEX "Dokumentnachweis_vorgabeId_idx" ON "Dokumentnachweis"("vorgabeId");

-- AddForeignKey
ALTER TABLE "Dokumentvorgabe" ADD CONSTRAINT "Dokumentvorgabe_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dokumentnachweis" ADD CONSTRAINT "Dokumentnachweis_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dokumentnachweis" ADD CONSTRAINT "Dokumentnachweis_vorgabeId_fkey" FOREIGN KEY ("vorgabeId") REFERENCES "Dokumentvorgabe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dokumentnachweis" ADD CONSTRAINT "Dokumentnachweis_gesellschaftId_fkey" FOREIGN KEY ("gesellschaftId") REFERENCES "Gesellschaft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dokumentnachweis" ADD CONSTRAINT "Dokumentnachweis_hausId_fkey" FOREIGN KEY ("hausId") REFERENCES "Haus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dokumentnachweis" ADD CONSTRAINT "Dokumentnachweis_kreditId_fkey" FOREIGN KEY ("kreditId") REFERENCES "Kredit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
