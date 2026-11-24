-- CreateEnum
CREATE TYPE "CovenantFolge" AS ENUM ('COVENANT', 'AUSSCHUETTUNGSSPERRE');

-- AlterTable
ALTER TABLE "Covenant" ADD COLUMN     "folge" "CovenantFolge" NOT NULL DEFAULT 'COVENANT';
