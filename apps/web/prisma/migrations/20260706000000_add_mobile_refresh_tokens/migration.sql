-- CreateTable
CREATE TABLE "mobile_refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceName" TEXT,
    "deviceId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mobile_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mobile_refresh_tokens_tokenHash_key" ON "mobile_refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "mobile_refresh_tokens_userId_idx" ON "mobile_refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "mobile_refresh_tokens_familyId_idx" ON "mobile_refresh_tokens"("familyId");

-- AddForeignKey
ALTER TABLE "mobile_refresh_tokens" ADD CONSTRAINT "mobile_refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
