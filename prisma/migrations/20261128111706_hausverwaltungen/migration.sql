-- CreateTable
CREATE TABLE "Hausverwaltung" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ansprechpartner" TEXT,
    "email" TEXT,
    "telefon" TEXT,
    "notiz" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hausverwaltung_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HausverwaltungZuordnung" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "hausId" TEXT NOT NULL,
    "hausverwaltungId" TEXT NOT NULL,
    "von" DATE NOT NULL,
    "bis" DATE,
    "notiz" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HausverwaltungZuordnung_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Hausverwaltung_mandantId_idx" ON "Hausverwaltung"("mandantId");

-- CreateIndex
CREATE INDEX "HausverwaltungZuordnung_mandantId_hausId_idx" ON "HausverwaltungZuordnung"("mandantId", "hausId");

-- CreateIndex
CREATE INDEX "HausverwaltungZuordnung_hausverwaltungId_idx" ON "HausverwaltungZuordnung"("hausverwaltungId");

-- AddForeignKey
ALTER TABLE "Hausverwaltung" ADD CONSTRAINT "Hausverwaltung_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HausverwaltungZuordnung" ADD CONSTRAINT "HausverwaltungZuordnung_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HausverwaltungZuordnung" ADD CONSTRAINT "HausverwaltungZuordnung_hausId_fkey" FOREIGN KEY ("hausId") REFERENCES "Haus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HausverwaltungZuordnung" ADD CONSTRAINT "HausverwaltungZuordnung_hausverwaltungId_fkey" FOREIGN KEY ("hausverwaltungId") REFERENCES "Hausverwaltung"("id") ON DELETE CASCADE ON UPDATE CASCADE;
