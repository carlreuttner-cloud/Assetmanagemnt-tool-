-- CreateEnum
CREATE TYPE "Bewertungsverfahren" AS ENUM ('ERTRAGSWERT', 'SACHWERT', 'VERGLEICHSWERT', 'SONSTIGES');

-- CreateTable
CREATE TABLE "Gutachten" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "hausId" TEXT NOT NULL,
    "stichtag" DATE NOT NULL,
    "erstelltAm" DATE,
    "gutachter" TEXT,
    "anlass" TEXT,
    "verfahren" "Bewertungsverfahren",
    "verkehrswert" DECIMAL(14,2) NOT NULL,
    "verkehrswertId" TEXT,
    "rohertragJahr" DECIMAL(14,2),
    "bewirtschaftungskosten" DECIMAL(14,2),
    "reinertragJahr" DECIMAL(14,2),
    "liegenschaftszins" DECIMAL(9,6),
    "restnutzungsdauer" INTEGER,
    "gesamtnutzungsdauer" INTEGER,
    "barwertfaktor" DECIMAL(9,6),
    "bodenwert" DECIMAL(14,2),
    "ertragswert" DECIMAL(14,2),
    "sachwert" DECIMAL(14,2),
    "vergleichswert" DECIMAL(14,2),
    "zuAbschlaege" DECIMAL(14,2),
    "baujahr" INTEGER,
    "wohnflaeche" DECIMAL(10,2),
    "gewerbeflaeche" DECIMAL(10,2),
    "grundstuecksflaeche" DECIMAL(10,2),
    "einheiten" INTEGER,
    "zustand" TEXT,
    "energieklasse" TEXT,
    "lage" TEXT,
    "staerken" TEXT,
    "schwaechen" TEXT,
    "chancen" TEXT,
    "risiken" TEXT,
    "notiz" TEXT,
    "angelegtAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gutachten_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Gutachten_verkehrswertId_key" ON "Gutachten"("verkehrswertId");

-- CreateIndex
CREATE INDEX "Gutachten_mandantId_idx" ON "Gutachten"("mandantId");

-- CreateIndex
CREATE INDEX "Gutachten_hausId_stichtag_idx" ON "Gutachten"("hausId", "stichtag");

-- AddForeignKey
ALTER TABLE "Gutachten" ADD CONSTRAINT "Gutachten_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gutachten" ADD CONSTRAINT "Gutachten_hausId_fkey" FOREIGN KEY ("hausId") REFERENCES "Haus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gutachten" ADD CONSTRAINT "Gutachten_verkehrswertId_fkey" FOREIGN KEY ("verkehrswertId") REFERENCES "Verkehrswert"("id") ON DELETE SET NULL ON UPDATE CASCADE;
