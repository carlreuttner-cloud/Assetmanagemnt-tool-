-- AlterTable
ALTER TABLE "Eingang" ADD COLUMN     "uploadLinkId" TEXT;

-- CreateTable
CREATE TABLE "UploadLink" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "absenderArt" "AbsenderArt",
    "schluesselHash" TEXT NOT NULL,
    "schluesselEnde" TEXT NOT NULL,
    "gueltigBis" TIMESTAMP(3) NOT NULL,
    "widerrufenAm" TIMESTAMP(3),
    "zuletztGenutzt" TIMESTAMP(3),
    "anzahlDateien" INTEGER NOT NULL DEFAULT 0,
    "erstelltVonId" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UploadLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UploadLink_schluesselHash_key" ON "UploadLink"("schluesselHash");

-- CreateIndex
CREATE INDEX "UploadLink_mandantId_idx" ON "UploadLink"("mandantId");

-- AddForeignKey
ALTER TABLE "Eingang" ADD CONSTRAINT "Eingang_uploadLinkId_fkey" FOREIGN KEY ("uploadLinkId") REFERENCES "UploadLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadLink" ADD CONSTRAINT "UploadLink_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
