-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "firstLoginAt" TIMESTAMP(3),
ADD COLUMN     "lastActiveAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "LessonSession" ADD COLUMN     "viewedAt" TIMESTAMP(3);
