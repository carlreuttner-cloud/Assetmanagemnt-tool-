-- CreateEnum
CREATE TYPE "MieterstandArt" AS ENUM ('VOLLSTAENDIG', 'NUR_LEERSTAND');

-- CreateTable
CREATE TABLE "Mieterstand" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "hausId" TEXT NOT NULL,
    "stichtag" DATE NOT NULL,
    "art" "MieterstandArt" NOT NULL DEFAULT 'VOLLSTAENDIG',
    "quelle" TEXT NOT NULL,
    "importvorgangId" TEXT,
    "erstelltVon" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mieterstand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MieterstandZeile" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "standId" TEXT NOT NULL,
    "einheitId" TEXT,
    "einheit" TEXT NOT NULL,
    "art" "EinheitArt" NOT NULL,
    "flaeche" DECIMAL(10,2),
    "leer" BOOLEAN,
    "mieter" TEXT,
    "beginn" DATE,
    "ende" DATE,
    "sollMiete" DECIMAL(14,2),
    "istMiete" DECIMAL(14,2),
    "nebenkosten" DECIMAL(14,2),
    "erwarteteMiete" DECIMAL(14,2),

    CONSTRAINT "MieterstandZeile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Mieterstand_mandantId_hausId_stichtag_idx" ON "Mieterstand"("mandantId", "hausId", "stichtag");

-- CreateIndex
CREATE INDEX "MieterstandZeile_standId_idx" ON "MieterstandZeile"("standId");

-- CreateIndex
CREATE INDEX "MieterstandZeile_mandantId_einheitId_idx" ON "MieterstandZeile"("mandantId", "einheitId");

-- AddForeignKey
ALTER TABLE "Mieterstand" ADD CONSTRAINT "Mieterstand_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mieterstand" ADD CONSTRAINT "Mieterstand_hausId_fkey" FOREIGN KEY ("hausId") REFERENCES "Haus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mieterstand" ADD CONSTRAINT "Mieterstand_importvorgangId_fkey" FOREIGN KEY ("importvorgangId") REFERENCES "Importvorgang"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MieterstandZeile" ADD CONSTRAINT "MieterstandZeile_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MieterstandZeile" ADD CONSTRAINT "MieterstandZeile_standId_fkey" FOREIGN KEY ("standId") REFERENCES "Mieterstand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MieterstandZeile" ADD CONSTRAINT "MieterstandZeile_einheitId_fkey" FOREIGN KEY ("einheitId") REFERENCES "Einheit"("id") ON DELETE SET NULL ON UPDATE CASCADE;
