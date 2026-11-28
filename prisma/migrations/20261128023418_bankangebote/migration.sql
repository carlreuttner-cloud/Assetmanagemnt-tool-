-- CreateEnum
CREATE TYPE "AngebotStatus" AS ENUM ('ENTWURF', 'BESTAETIGT');

-- CreateTable
CREATE TABLE "Bankangebot" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "bank" TEXT NOT NULL,
    "bezeichnung" TEXT,
    "gesellschaftId" TEXT,
    "kreditId" TEXT,
    "dokumentId" TEXT,
    "angebotVom" DATE,
    "gueltigBis" DATE,
    "betrag" DECIMAL(14,2),
    "zinsArt" "ZinsArt" NOT NULL DEFAULT 'FEST',
    "sollzins" DECIMAL(9,6),
    "referenzzins" TEXT,
    "marge" DECIMAL(9,6),
    "zinsbindungMonate" INTEGER,
    "laufzeitMonate" INTEGER,
    "zahlweise" "Zahlweise" NOT NULL DEFAULT 'MONATLICH',
    "tilgungsart" "Tilgungsart" NOT NULL DEFAULT 'ANNUITAET',
    "tilgungProzent" DECIMAL(9,6),
    "auszahlungProzent" DECIMAL(9,6),
    "bearbeitungsgebuehr" DECIMAL(14,2),
    "sonstigeKosten" DECIMAL(14,2),
    "bereitstellungszins" DECIMAL(9,6),
    "bereitstellungsfreiMonate" INTEGER,
    "sondertilgungProzent" DECIMAL(9,6),
    "covenants" TEXT,
    "sicherheiten" TEXT,
    "notiz" TEXT,
    "status" "AngebotStatus" NOT NULL DEFAULT 'ENTWURF',
    "vorschlag" JSONB,
    "kiModell" TEXT,
    "erstelltVonId" TEXT,
    "bestaetigtVonId" TEXT,
    "bestaetigtAm" TIMESTAMP(3),
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bankangebot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Bankangebot_mandantId_status_idx" ON "Bankangebot"("mandantId", "status");

-- AddForeignKey
ALTER TABLE "Bankangebot" ADD CONSTRAINT "Bankangebot_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bankangebot" ADD CONSTRAINT "Bankangebot_gesellschaftId_fkey" FOREIGN KEY ("gesellschaftId") REFERENCES "Gesellschaft"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bankangebot" ADD CONSTRAINT "Bankangebot_kreditId_fkey" FOREIGN KEY ("kreditId") REFERENCES "Kredit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bankangebot" ADD CONSTRAINT "Bankangebot_dokumentId_fkey" FOREIGN KEY ("dokumentId") REFERENCES "Dokument"("id") ON DELETE SET NULL ON UPDATE CASCADE;
