-- CreateEnum
CREATE TYPE "AbschlussQuelle" AS ENUM ('JAHRESABSCHLUSS', 'BWA', 'SONSTIGE');

-- CreateEnum
CREATE TYPE "AbschlussStatus" AS ENUM ('ENDGUELTIG', 'ENTWURF');

-- CreateTable
CREATE TABLE "Geschaeftsjahr" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "gesellschaftId" TEXT NOT NULL,
    "jahr" INTEGER NOT NULL,
    "beginn" DATE NOT NULL,
    "ende" DATE NOT NULL,
    "quelle" "AbschlussQuelle" NOT NULL,
    "quelleText" TEXT,
    "status" "AbschlussStatus" NOT NULL,
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
    "anlagevermoegen" DECIMAL(14,2),
    "umlaufvermoegen" DECIMAL(14,2),
    "liquideMittel" DECIMAL(14,2),
    "eigenkapital" DECIMAL(14,2),
    "rueckstellungen" DECIMAL(14,2),
    "verbindlichkeitenBanken" DECIMAL(14,2),
    "sonstigeVerbindlichkeiten" DECIMAL(14,2),
    "cashflowLaufend" DECIMAL(14,2),
    "cashflowInvestition" DECIMAL(14,2),
    "cashflowFinanzierung" DECIMAL(14,2),
    "notiz" TEXT,
    "angelegtAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Geschaeftsjahr_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Geschaeftsjahr_mandantId_idx" ON "Geschaeftsjahr"("mandantId");

-- CreateIndex
CREATE UNIQUE INDEX "Geschaeftsjahr_gesellschaftId_jahr_key" ON "Geschaeftsjahr"("gesellschaftId", "jahr");

-- AddForeignKey
ALTER TABLE "Geschaeftsjahr" ADD CONSTRAINT "Geschaeftsjahr_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Geschaeftsjahr" ADD CONSTRAINT "Geschaeftsjahr_gesellschaftId_fkey" FOREIGN KEY ("gesellschaftId") REFERENCES "Gesellschaft"("id") ON DELETE CASCADE ON UPDATE CASCADE;
