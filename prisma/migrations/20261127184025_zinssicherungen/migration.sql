-- CreateEnum
CREATE TYPE "ZinssicherungArt" AS ENUM ('CAP', 'SWAP');

-- CreateTable
CREATE TABLE "Zinssicherung" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "kreditId" TEXT NOT NULL,
    "art" "ZinssicherungArt" NOT NULL,
    "satz" DECIMAL(9,6) NOT NULL,
    "nominal" DECIMAL(14,2),
    "beginn" DATE NOT NULL,
    "ende" DATE NOT NULL,
    "bank" TEXT,
    "praemie" DECIMAL(14,2),
    "quelle" TEXT,
    "notiz" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Zinssicherung_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Zinssicherung_mandantId_idx" ON "Zinssicherung"("mandantId");

-- CreateIndex
CREATE INDEX "Zinssicherung_kreditId_idx" ON "Zinssicherung"("kreditId");

-- AddForeignKey
ALTER TABLE "Zinssicherung" ADD CONSTRAINT "Zinssicherung_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Zinssicherung" ADD CONSTRAINT "Zinssicherung_kreditId_fkey" FOREIGN KEY ("kreditId") REFERENCES "Kredit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
