-- CreateEnum
CREATE TYPE "KreditArt" AS ENUM ('BANK', 'GESELLSCHAFTERDARLEHEN', 'NACHRANGDARLEHEN');

-- AlterTable
ALTER TABLE "Kredit" ADD COLUMN     "gesellschafterId" TEXT,
ADD COLUMN     "kreditart" "KreditArt" NOT NULL DEFAULT 'BANK',
ADD COLUMN     "rang" INTEGER;

-- AddForeignKey
ALTER TABLE "Kredit" ADD CONSTRAINT "Kredit_gesellschafterId_fkey" FOREIGN KEY ("gesellschafterId") REFERENCES "Gesellschafter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
