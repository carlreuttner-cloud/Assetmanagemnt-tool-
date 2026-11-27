-- AlterTable
ALTER TABLE "Gesellschaft" ADD COLUMN     "portfolioId" TEXT;

-- CreateTable
CREATE TABLE "Portfolio" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "beschreibung" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Portfolio_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Portfolio_mandantId_idx" ON "Portfolio"("mandantId");

-- CreateIndex
CREATE UNIQUE INDEX "Portfolio_mandantId_name_key" ON "Portfolio"("mandantId", "name");

-- CreateIndex
CREATE INDEX "Gesellschaft_portfolioId_idx" ON "Gesellschaft"("portfolioId");

-- AddForeignKey
ALTER TABLE "Portfolio" ADD CONSTRAINT "Portfolio_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gesellschaft" ADD CONSTRAINT "Gesellschaft_portfolioId_fkey" FOREIGN KEY ("portfolioId") REFERENCES "Portfolio"("id") ON DELETE SET NULL ON UPDATE CASCADE;
