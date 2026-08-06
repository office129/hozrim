/*
  Warnings:

  - You are about to drop the column `driveFolderId` on the `Exercise` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Exercise" DROP COLUMN "driveFolderId",
ADD COLUMN     "folderId" TEXT;

-- CreateTable
CREATE TABLE "ExerciseFolder" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "driveFolderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExerciseFolder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExerciseFolder_clientId_order_idx" ON "ExerciseFolder"("clientId", "order");

-- CreateIndex
CREATE INDEX "Exercise_folderId_idx" ON "Exercise"("folderId");

-- AddForeignKey
ALTER TABLE "ExerciseFolder" ADD CONSTRAINT "ExerciseFolder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "ExerciseFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
