-- CreateEnum
CREATE TYPE "SondertilgungRecht" AS ENUM ('UNBEKANNT', 'KEINES', 'PROZENT', 'BETRAG');

-- CreateEnum
CREATE TYPE "SondertilgungJahr" AS ENUM ('KALENDERJAHR', 'VERTRAGSJAHR');

-- AlterTable
ALTER TABLE "Kredit" ADD COLUMN     "sondertilgungBis" DATE,
ADD COLUMN     "sondertilgungJahr" "SondertilgungJahr" NOT NULL DEFAULT 'KALENDERJAHR',
ADD COLUMN     "sondertilgungRecht" "SondertilgungRecht" NOT NULL DEFAULT 'UNBEKANNT',
ADD COLUMN     "sondertilgungUebertragbar" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sondertilgungWert" DECIMAL(14,6);
