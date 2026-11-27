-- CreateTable
CREATE TABLE "Exitrechnung" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "hausId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "verkaufsdatum" DATE NOT NULL,
    "preisBasis" TEXT NOT NULL,
    "preis" DECIMAL(14,2),
    "faktor" DECIMAL(9,4),
    "maklerProzent" DECIMAL(9,4) NOT NULL,
    "sonstigeProzent" DECIMAL(9,4) NOT NULL,
    "vfeProzent" DECIMAL(9,4),
    "notiz" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exitrechnung_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Exitrechnung_mandantId_idx" ON "Exitrechnung"("mandantId");

-- CreateIndex
CREATE INDEX "Exitrechnung_hausId_idx" ON "Exitrechnung"("hausId");

-- AddForeignKey
ALTER TABLE "Exitrechnung" ADD CONSTRAINT "Exitrechnung_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exitrechnung" ADD CONSTRAINT "Exitrechnung_hausId_fkey" FOREIGN KEY ("hausId") REFERENCES "Haus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
