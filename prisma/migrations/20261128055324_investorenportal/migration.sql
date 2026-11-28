-- AlterTable
ALTER TABLE "Dokument" ADD COLUMN     "investorFreigabeAm" TIMESTAMP(3),
ADD COLUMN     "investorFreigabeVon" TEXT;

-- AlterTable
ALTER TABLE "Gesellschafter" ADD COLUMN     "mitgliedschaftId" TEXT;

-- AddForeignKey
ALTER TABLE "Gesellschafter" ADD CONSTRAINT "Gesellschafter_mitgliedschaftId_fkey" FOREIGN KEY ("mitgliedschaftId") REFERENCES "Mitgliedschaft"("id") ON DELETE SET NULL ON UPDATE CASCADE;
