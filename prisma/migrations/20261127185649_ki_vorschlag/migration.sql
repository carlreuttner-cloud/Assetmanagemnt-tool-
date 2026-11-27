-- CreateTable
CREATE TABLE "KiVorschlag" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "hausId" TEXT NOT NULL,
    "benutzerId" TEXT,
    "stichtag" DATE NOT NULL,
    "modell" TEXT NOT NULL,
    "status" "KiAnalyseStatus" NOT NULL,
    "datenpaket" JSONB NOT NULL,
    "ergebnis" JSONB,
    "fehler" TEXT,
    "tokensEingabe" INTEGER,
    "tokensAusgabe" INTEGER,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KiVorschlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KiVorschlag_mandantId_idx" ON "KiVorschlag"("mandantId");

-- CreateIndex
CREATE INDEX "KiVorschlag_hausId_idx" ON "KiVorschlag"("hausId");

-- AddForeignKey
ALTER TABLE "KiVorschlag" ADD CONSTRAINT "KiVorschlag_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KiVorschlag" ADD CONSTRAINT "KiVorschlag_hausId_fkey" FOREIGN KEY ("hausId") REFERENCES "Haus"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KiVorschlag" ADD CONSTRAINT "KiVorschlag_benutzerId_fkey" FOREIGN KEY ("benutzerId") REFERENCES "Benutzer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
