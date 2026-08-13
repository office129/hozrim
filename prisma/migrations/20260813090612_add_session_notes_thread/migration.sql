-- CreateTable
CREATE TABLE "SessionNote" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SessionNote_sessionId_createdAt_idx" ON "SessionNote"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "SessionNote" ADD CONSTRAINT "SessionNote_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "LessonSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Preserve any existing single note: turn each session's current clientNote
-- into the first note of its new thread, before the column is dropped.
INSERT INTO "SessionNote" ("id", "sessionId", "text", "createdAt")
SELECT gen_random_uuid()::text, "id", "clientNote", "createdAt"
FROM "LessonSession"
WHERE "clientNote" IS NOT NULL AND btrim("clientNote") <> '';

-- AlterTable
ALTER TABLE "LessonSession" DROP COLUMN "clientNote",
DROP COLUMN "clientNoteNotifiedAt";
