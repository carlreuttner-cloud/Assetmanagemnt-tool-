-- CreateTable
CREATE TABLE "Lesezeichen" (
    "id" TEXT NOT NULL,
    "mandantId" TEXT NOT NULL,
    "benutzerId" TEXT NOT NULL,
    "pfad" TEXT NOT NULL,
    "titel" TEXT NOT NULL,
    "objektArt" TEXT NOT NULL,
    "favorit" BOOLEAN NOT NULL DEFAULT false,
    "favoritSeit" TIMESTAMP(3),
    "angesehenAm" TIMESTAMP(3),

    CONSTRAINT "Lesezeichen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Lesezeichen_mandantId_benutzerId_angesehenAm_idx" ON "Lesezeichen"("mandantId", "benutzerId", "angesehenAm");

-- CreateIndex
CREATE UNIQUE INDEX "Lesezeichen_mandantId_benutzerId_pfad_key" ON "Lesezeichen"("mandantId", "benutzerId", "pfad");

-- AddForeignKey
ALTER TABLE "Lesezeichen" ADD CONSTRAINT "Lesezeichen_mandantId_fkey" FOREIGN KEY ("mandantId") REFERENCES "Mandant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesezeichen" ADD CONSTRAINT "Lesezeichen_benutzerId_fkey" FOREIGN KEY ("benutzerId") REFERENCES "Benutzer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
