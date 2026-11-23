-- CreateEnum
CREATE TYPE "ImportArt" AS ENUM ('KREDITBUCHUNGEN', 'MIETERLISTE');

-- CreateTable
CREATE TABLE "Importvorgang" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "art" "ImportArt" NOT NULL,
    "dateiname" TEXT NOT NULL,
    "benutzerId" TEXT,
    "hausId" TEXT,
    "kreditId" TEXT,
    "stand" DATE,
    "ergebnis" JSONB NOT NULL,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Importvorgang_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Importvorgang_mandantId_erstelltAm_idx" ON "Importvorgang"("mandantId", "erstelltAm");

-- AddForeignKey
ALTER TABLE "Importvorgang" ADD CONSTRAINT "Importvorgang_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Importvorgang" ADD CONSTRAINT "Importvorgang_benutzerId_fkey" FOREIGN KEY ("benutzerId") REFERENCES "Benutzer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Importvorgang" ADD CONSTRAINT "Importvorgang_hausId_fkey" FOREIGN KEY ("hausId") REFERENCES "Haus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Importvorgang" ADD CONSTRAINT "Importvorgang_kreditId_fkey" FOREIGN KEY ("kreditId") REFERENCES "Kredit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
