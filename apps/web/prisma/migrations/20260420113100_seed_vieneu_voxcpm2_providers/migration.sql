INSERT INTO "provider_configs" (
  "id",
  "name",
  "apiKeyEnc",
  "enabled",
  "isDefault",
  "config",
  "createdAt",
  "updatedAt"
)
SELECT
  'provider_vieneu_tts',
  'VIENEU_TTS'::"ProviderName",
  NULL,
  false,
  false,
  '{"model":"pnnbao-ump/VieNeu-TTS","mode":"local","device":"mps","maxChunkChars":320}'::jsonb,
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM "provider_configs" WHERE "name" = 'VIENEU_TTS'::"ProviderName"
);

INSERT INTO "provider_configs" (
  "id",
  "name",
  "apiKeyEnc",
  "enabled",
  "isDefault",
  "config",
  "createdAt",
  "updatedAt"
)
SELECT
  'provider_voxcpm2',
  'VOXCPM2'::"ProviderName",
  NULL,
  false,
  false,
  '{"model":"openbmb/VoxCPM2","device":"cuda","cfgValue":2.0,"inferenceTimesteps":10,"loadDenoiser":false,"usePromptClone":false,"maxChunkChars":260}'::jsonb,
  now(),
  now()
WHERE NOT EXISTS (
  SELECT 1 FROM "provider_configs" WHERE "name" = 'VOXCPM2'::"ProviderName"
);
