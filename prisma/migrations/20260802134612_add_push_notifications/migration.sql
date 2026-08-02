-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "hasSeenPushHint" BOOLEAN NOT NULL DEFAULT false;

-- Same reasoning as the welcome-popup backfill: a one-time hint about a
-- feature that didn't exist yet shouldn't suddenly appear for clients
-- who've already been using the app for a while.
UPDATE "Client" SET "hasSeenPushHint" = true;

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_clientId_idx" ON "PushSubscription"("clientId");

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
