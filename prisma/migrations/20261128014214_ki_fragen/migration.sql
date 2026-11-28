-- CreateTable
CREATE TABLE "KiFrage" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "benutzerId" TEXT NOT NULL,
    "frage" TEXT NOT NULL,
    "stichtag" DATE NOT NULL,
    "modell" TEXT NOT NULL,
    "status" "KiAnalyseStatus" NOT NULL,
    "daten" JSONB,
    "antwort" JSONB,
    "fehler" TEXT,
    "tokensEingabe" INTEGER,
    "tokensAusgabe" INTEGER,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KiFrage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KiFrage_mandantId_benutzerId_idx" ON "KiFrage"("mandantId", "benutzerId");

-- AddForeignKey
ALTER TABLE "KiFrage" ADD CONSTRAINT "KiFrage_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KiFrage" ADD CONSTRAINT "KiFrage_benutzerId_fkey" FOREIGN KEY ("benutzerId") REFERENCES "Benutzer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
