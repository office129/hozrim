/*
  Warnings:

  - You are about to drop the column `hasSeenBellTip` on the `Client` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Client" DROP COLUMN "hasSeenBellTip",
ADD COLUMN     "hasSeededWelcomeNotification" BOOLEAN NOT NULL DEFAULT false;
