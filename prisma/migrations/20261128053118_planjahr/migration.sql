-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('ENTWURF', 'BESCHLOSSEN');

-- CreateTable
CREATE TABLE "Planjahr" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "gesellschaftId" TEXT NOT NULL,
    "jahr" INTEGER NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'ENTWURF',
    "quelle" TEXT,
    "beschlossenAm" DATE,
    "umsatzerloese" DECIMAL(14,2),
    "sonstigeErtraege" DECIMAL(14,2),
    "materialaufwand" DECIMAL(14,2),
    "personalaufwand" DECIMAL(14,2),
    "sonstigeAufwendungen" DECIMAL(14,2),
    "abschreibungen" DECIMAL(14,2),
    "zinsertraege" DECIMAL(14,2),
    "zinsaufwendungen" DECIMAL(14,2),
    "steuern" DECIMAL(14,2),
    "jahresergebnis" DECIMAL(14,2),
    "notiz" TEXT,
    "erstelltVon" TEXT,
    "angelegtAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Planjahr_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Planerklaerung" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "planjahrId" TEXT NOT NULL,
    "zeile" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "erstelltVon" TEXT,
    "geaendertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Planerklaerung_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Planjahr_mandantId_idx" ON "Planjahr"("mandantId");

-- CreateIndex
CREATE UNIQUE INDEX "Planjahr_gesellschaftId_jahr_key" ON "Planjahr"("gesellschaftId", "jahr");

-- CreateIndex
CREATE INDEX "Planerklaerung_mandantId_idx" ON "Planerklaerung"("mandantId");

-- CreateIndex
CREATE UNIQUE INDEX "Planerklaerung_planjahrId_zeile_key" ON "Planerklaerung"("planjahrId", "zeile");

-- AddForeignKey
ALTER TABLE "Planjahr" ADD CONSTRAINT "Planjahr_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Planjahr" ADD CONSTRAINT "Planjahr_gesellschaftId_fkey" FOREIGN KEY ("gesellschaftId") REFERENCES "Gesellschaft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Planerklaerung" ADD CONSTRAINT "Planerklaerung_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Planerklaerung" ADD CONSTRAINT "Planerklaerung_planjahrId_fkey" FOREIGN KEY ("planjahrId") REFERENCES "Planjahr"("id") ON DELETE CASCADE ON UPDATE CASCADE;
