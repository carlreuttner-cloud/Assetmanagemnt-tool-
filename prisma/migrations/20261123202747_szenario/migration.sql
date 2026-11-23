-- CreateTable
CREATE TABLE "Szenario" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "beschreibung" TEXT,
    "gesellschaftId" TEXT,
    "parameter" JSONB NOT NULL,
    "benutzerId" TEXT,
    "erstelltAm" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "geaendertAm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Szenario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Szenario_mandantId_idx" ON "Szenario"("mandantId");

-- AddForeignKey
ALTER TABLE "Szenario" ADD CONSTRAINT "Szenario_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Szenario" ADD CONSTRAINT "Szenario_gesellschaftId_fkey" FOREIGN KEY ("gesellschaftId") REFERENCES "Gesellschaft"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Szenario" ADD CONSTRAINT "Szenario_benutzerId_fkey" FOREIGN KEY ("benutzerId") REFERENCES "Benutzer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
