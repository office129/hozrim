-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "driveUploadsFolderId" TEXT;

-- CreateTable
CREATE TABLE "PersonalUpload" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PersonalUpload_clientId_createdAt_idx" ON "PersonalUpload"("clientId", "createdAt");

-- AddForeignKey
ALTER TABLE "PersonalUpload" ADD CONSTRAINT "PersonalUpload_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
