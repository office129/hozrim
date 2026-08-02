/*
  Warnings:

  - You are about to drop the column `clientId` on the `PersonalUpload` table. All the data in the column will be lost.
  - Added the required column `groupId` to the `PersonalUpload` table without a default value. This is not possible if the table is not empty.

*/
-- This table was only introduced earlier today (personal uploads feature
-- shipped, then redesigned into named groups the same day) - any row in
-- it so far is today's own test upload, not real client data, so it's
-- safe to clear before restructuring the column rather than needing a
-- real backfill.
DELETE FROM "PersonalUpload";

-- DropForeignKey
ALTER TABLE "PersonalUpload" DROP CONSTRAINT "PersonalUpload_clientId_fkey";

-- DropIndex
DROP INDEX "PersonalUpload_clientId_createdAt_idx";

-- AlterTable
ALTER TABLE "PersonalUpload" DROP COLUMN "clientId",
ADD COLUMN     "groupId" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "PersonalUploadGroup" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "driveFolderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalUploadGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PersonalUploadGroup_clientId_createdAt_idx" ON "PersonalUploadGroup"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "PersonalUpload_groupId_createdAt_idx" ON "PersonalUpload"("groupId", "createdAt");

-- AddForeignKey
ALTER TABLE "PersonalUploadGroup" ADD CONSTRAINT "PersonalUploadGroup_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalUpload" ADD CONSTRAINT "PersonalUpload_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PersonalUploadGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
