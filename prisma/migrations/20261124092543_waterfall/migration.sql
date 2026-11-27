-- CreateEnum
CREATE TYPE "KapitalbewegungArt" AS ENUM ('EINLAGE', 'RUECKZAHLUNG', 'AUSSCHUETTUNG');

-- CreateEnum
CREATE TYPE "Verzinsung" AS ENUM ('EINFACH', 'ZINSESZINS');

-- CreateTable
CREATE TABLE "Gesellschafter" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "gesellschaftId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "beteiligungProzent" DECIMAL(9,6),
    "gewinnanteilProzent" DECIMAL(9,6),
    "notiz" TEXT,
    "angelegtAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Gesellschafter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kapitalbewegung" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "gesellschafterId" TEXT NOT NULL,
    "art" "KapitalbewegungArt" NOT NULL,
    "datum" DATE,
    "betrag" DECIMAL(14,2) NOT NULL,
    "quelle" TEXT,
    "notiz" TEXT,

    CONSTRAINT "Kapitalbewegung_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Waterfallvertrag" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "gesellschaftId" TEXT NOT NULL,
    "vorzugsrenditeProzent" DECIMAL(9,6) NOT NULL,
    "verzinsung" "Verzinsung" NOT NULL,
    "ausschuettungenAnrechnen" BOOLEAN NOT NULL DEFAULT true,
    "quelle" TEXT NOT NULL,
    "notiz" TEXT,
    "geaendertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Waterfallvertrag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Gesellschafter_mandantId_idx" ON "Gesellschafter"("mandantId");

-- CreateIndex
CREATE INDEX "Gesellschafter_gesellschaftId_idx" ON "Gesellschafter"("gesellschaftId");

-- CreateIndex
CREATE INDEX "Kapitalbewegung_mandantId_idx" ON "Kapitalbewegung"("mandantId");

-- CreateIndex
CREATE INDEX "Kapitalbewegung_gesellschafterId_idx" ON "Kapitalbewegung"("gesellschafterId");

-- CreateIndex
CREATE UNIQUE INDEX "Waterfallvertrag_gesellschaftId_key" ON "Waterfallvertrag"("gesellschaftId");

-- CreateIndex
CREATE INDEX "Waterfallvertrag_mandantId_idx" ON "Waterfallvertrag"("mandantId");

-- AddForeignKey
ALTER TABLE "Gesellschafter" ADD CONSTRAINT "Gesellschafter_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gesellschafter" ADD CONSTRAINT "Gesellschafter_gesellschaftId_fkey" FOREIGN KEY ("gesellschaftId") REFERENCES "Gesellschaft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kapitalbewegung" ADD CONSTRAINT "Kapitalbewegung_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kapitalbewegung" ADD CONSTRAINT "Kapitalbewegung_gesellschafterId_fkey" FOREIGN KEY ("gesellschafterId") REFERENCES "Gesellschafter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Waterfallvertrag" ADD CONSTRAINT "Waterfallvertrag_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Waterfallvertrag" ADD CONSTRAINT "Waterfallvertrag_gesellschaftId_fkey" FOREIGN KEY ("gesellschaftId") REFERENCES "Gesellschaft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
