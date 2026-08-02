-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "hasSeenBellTip" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasSeenWelcomePopup" BOOLEAN NOT NULL DEFAULT false;

-- This is a one-time welcome for brand-new clients - backfill existing
-- rows to "already seen" so nobody who's already using the app suddenly
-- gets greeted as if they just signed up.
UPDATE "Client" SET "hasSeenWelcomePopup" = true, "hasSeenBellTip" = true;
