-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "driveFolderId" TEXT;

-- CreateTable
CREATE TABLE "GoogleDriveConnection" (
    "id" TEXT NOT NULL,
    "connectedEmail" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoogleDriveConnection_pkey" PRIMARY KEY ("id")
);
