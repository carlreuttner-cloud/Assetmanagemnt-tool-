-- AlterTable
ALTER TABLE "Covenant" ADD COLUMN     "ersterTest" DATE,
ADD COLUMN     "testIntervallMonate" INTEGER;

-- CreateTable
CREATE TABLE "CovenantNachweis" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "kreditId" TEXT NOT NULL,
    "stichtag" DATE NOT NULL,
    "inhalt" JSONB NOT NULL,
    "erstelltVon" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CovenantNachweis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CovenantNachweis_mandantId_idx" ON "CovenantNachweis"("mandantId");

-- CreateIndex
CREATE INDEX "CovenantNachweis_kreditId_stichtag_idx" ON "CovenantNachweis"("kreditId", "stichtag");

-- AddForeignKey
ALTER TABLE "CovenantNachweis" ADD CONSTRAINT "CovenantNachweis_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CovenantNachweis" ADD CONSTRAINT "CovenantNachweis_kreditId_fkey" FOREIGN KEY ("kreditId") REFERENCES "Kredit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
