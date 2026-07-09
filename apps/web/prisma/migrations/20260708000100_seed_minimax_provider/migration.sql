INSERT INTO "provider_configs" (
  "id", "name", "apiKeyEnc", "enabled", "isDefault", "config", "createdAt", "updatedAt"
)
SELECT 'provider_minimax_tts', 'MINIMAX_TTS'::"ProviderName", NULL, false, false,
  '{"model":"speech-2.6-hd","voice":"Wise_Woman","format":"mp3","sampleRate":32000,"bitRate":128000,"noiseReduction":false,"maxChunkChars":3000}'::jsonb,
  now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "provider_configs" WHERE "name" = 'MINIMAX_TTS'::"ProviderName"
);
