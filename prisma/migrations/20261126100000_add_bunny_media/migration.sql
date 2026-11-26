-- CreateTable
CREATE TABLE "BunnyMedia" (
    "sourceKey" TEXT NOT NULL,
    "guid" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "ownerKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" INTEGER,
    "ready" BOOLEAN NOT NULL DEFAULT false,
    "failedAt" TIMESTAMP(3),
    "error" TEXT,
    "sizeBytes" BIGINT,
    "sourceBytes" BIGINT,
    "readyAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BunnyMedia_pkey" PRIMARY KEY ("sourceKey")
);

-- CreateTable
CREATE TABLE "BunnyCollection" (
    "ownerKey" TEXT NOT NULL,
    "guid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BunnyCollection_pkey" PRIMARY KEY ("ownerKey")
);

-- CreateIndex
CREATE INDEX "BunnyMedia_ready_idx" ON "BunnyMedia"("ready");

-- CreateIndex
CREATE INDEX "BunnyMedia_ownerKey_idx" ON "BunnyMedia"("ownerKey");
