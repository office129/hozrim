-- AlterTable
ALTER TABLE "GoogleDriveConnection" ADD COLUMN     "meetRecordingsFolderId" TEXT;

-- CreateTable
CREATE TABLE "MeetRecordingImport" (
    "id" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "recordingDate" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "matchedNames" TEXT,
    "clientId" TEXT,
    "sessionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetRecordingImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MeetRecordingImport_driveFileId_key" ON "MeetRecordingImport"("driveFileId");

-- CreateIndex
CREATE INDEX "MeetRecordingImport_status_idx" ON "MeetRecordingImport"("status");
