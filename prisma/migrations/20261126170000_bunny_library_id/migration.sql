-- AlterTable
ALTER TABLE "BunnyMedia" ADD COLUMN "libraryId" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "BunnyCollection" ADD COLUMN "libraryId" TEXT NOT NULL DEFAULT '';
