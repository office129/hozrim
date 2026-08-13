-- AlterTable
ALTER TABLE "SessionNote" ADD COLUMN     "author" TEXT NOT NULL DEFAULT 'client',
ADD COLUMN     "parentId" TEXT;

-- CreateIndex
CREATE INDEX "SessionNote_parentId_idx" ON "SessionNote"("parentId");

-- AddForeignKey
ALTER TABLE "SessionNote" ADD CONSTRAINT "SessionNote_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "SessionNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;
