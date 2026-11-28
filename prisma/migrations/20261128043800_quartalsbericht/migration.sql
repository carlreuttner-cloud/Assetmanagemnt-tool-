-- CreateEnum
CREATE TYPE "BerichtStatus" AS ENUM ('ENTWURF', 'FREIGEGEBEN', 'VERWORFEN');

-- CreateTable
CREATE TABLE "Quartalsbericht" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "gesellschaftId" TEXT,
    "jahr" INTEGER NOT NULL,
    "quartal" INTEGER NOT NULL,
    "stichtag" DATE NOT NULL,
    "status" "BerichtStatus" NOT NULL DEFAULT 'ENTWURF',
    "inhalt" JSONB NOT NULL,
    "kommentar" TEXT,
    "erstelltVonId" TEXT NOT NULL,
    "erstelltVonName" TEXT NOT NULL,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "freigegebenVonId" TEXT,
    "freigegebenVonName" TEXT,
    "freigegebenAm" TIMESTAMP(3),
    "verworfenGrund" TEXT,
    "geaendertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quartalsbericht_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Quartalsbericht_mandantId_idx" ON "Quartalsbericht"("mandantId");

-- CreateIndex
CREATE INDEX "Quartalsbericht_gesellschaftId_jahr_quartal_idx" ON "Quartalsbericht"("gesellschaftId", "jahr", "quartal");

-- AddForeignKey
ALTER TABLE "Quartalsbericht" ADD CONSTRAINT "Quartalsbericht_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quartalsbericht" ADD CONSTRAINT "Quartalsbericht_gesellschaftId_fkey" FOREIGN KEY ("gesellschaftId") REFERENCES "Gesellschaft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
