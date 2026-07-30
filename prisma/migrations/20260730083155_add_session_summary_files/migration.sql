-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "hasSeenSessionCompleteTip" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "SessionSummaryFile" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionSummaryFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionSummaryFile_sessionId_order_idx" ON "SessionSummaryFile"("sessionId", "order");

-- AddForeignKey
ALTER TABLE "SessionSummaryFile" ADD CONSTRAINT "SessionSummaryFile_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LessonSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing single summary files into the new table before the old
-- columns disappear.
INSERT INTO "SessionSummaryFile" ("id", "sessionId", "url", "fileName", "order", "createdAt")
SELECT gen_random_uuid()::text, "id", "summaryFileUrl", COALESCE("summaryFileName", 'summary.pdf'), 0, "createdAt"
FROM "LessonSession"
WHERE "summaryFileUrl" IS NOT NULL;

-- AlterTable
ALTER TABLE "LessonSession" DROP COLUMN "summaryFileName",
DROP COLUMN "summaryFileUrl";
