-- CreateTable
CREATE TABLE "ClientPasskey" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "transports" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientPasskey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientPasskey_credentialId_key" ON "ClientPasskey"("credentialId");

-- AddForeignKey
ALTER TABLE "ClientPasskey" ADD CONSTRAINT "ClientPasskey_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
