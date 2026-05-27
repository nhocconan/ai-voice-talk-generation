-- Add new GenKind values (PostgreSQL enums require ALTER TYPE for additions)
ALTER TYPE "GenKind" ADD VALUE IF NOT EXISTS 'VIDEO_REVOICE';
ALTER TYPE "GenKind" ADD VALUE IF NOT EXISTS 'AUDIOGRAM';

-- Extend Generation with video + audiogram fields
ALTER TABLE "generations"
  ADD COLUMN IF NOT EXISTS "sourceVideoKey" TEXT,
  ADD COLUMN IF NOT EXISTS "outputVideoKey" TEXT,
  ADD COLUMN IF NOT EXISTS "audiogram" BOOLEAN NOT NULL DEFAULT false;

-- ModelKind enum
DO $$ BEGIN
  CREATE TYPE "ModelKind" AS ENUM ('TTS', 'STT', 'LLM');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ProviderModel catalog
CREATE TABLE IF NOT EXISTS "provider_models" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "modelId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "kind" "ModelKind" NOT NULL DEFAULT 'TTS',
  "languages" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "meta" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "provider_models_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "provider_models_providerId_modelId_key"
  ON "provider_models"("providerId", "modelId");

CREATE INDEX IF NOT EXISTS "provider_models_providerId_enabled_idx"
  ON "provider_models"("providerId", "enabled");

ALTER TABLE "provider_models"
  ADD CONSTRAINT "provider_models_providerId_fkey"
  FOREIGN KEY ("providerId") REFERENCES "provider_configs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
