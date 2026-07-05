INSERT INTO "provider_configs" (
  "id", "name", "apiKeyEnc", "enabled", "isDefault", "config", "createdAt", "updatedAt"
)
SELECT 'provider_gemini_llm', 'GEMINI_LLM'::"ProviderName", NULL, false, false,
  '{"model":"gemini-2.5-flash"}'::jsonb, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "provider_configs" WHERE "name" = 'GEMINI_LLM'::"ProviderName"
);

INSERT INTO "provider_configs" (
  "id", "name", "apiKeyEnc", "enabled", "isDefault", "config", "createdAt", "updatedAt"
)
SELECT 'provider_groq', 'GROQ'::"ProviderName", NULL, false, false,
  '{"baseUrl":"https://api.groq.com/openai/v1","model":"llama-3.3-70b-versatile"}'::jsonb, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "provider_configs" WHERE "name" = 'GROQ'::"ProviderName"
);

INSERT INTO "provider_configs" (
  "id", "name", "apiKeyEnc", "enabled", "isDefault", "config", "createdAt", "updatedAt"
)
SELECT 'provider_xai_llm', 'XAI_LLM'::"ProviderName", NULL, false, false,
  '{"baseUrl":"https://api.x.ai/v1","model":"grok-4.3"}'::jsonb, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "provider_configs" WHERE "name" = 'XAI_LLM'::"ProviderName"
);

INSERT INTO "provider_configs" (
  "id", "name", "apiKeyEnc", "enabled", "isDefault", "config", "createdAt", "updatedAt"
)
SELECT 'provider_grok_oauth', 'GROK_OAUTH'::"ProviderName", NULL, false, false,
  '{"model":"grok-4.3"}'::jsonb, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "provider_configs" WHERE "name" = 'GROK_OAUTH'::"ProviderName"
);

INSERT INTO "provider_configs" (
  "id", "name", "apiKeyEnc", "enabled", "isDefault", "config", "createdAt", "updatedAt"
)
SELECT 'provider_ollama', 'OLLAMA'::"ProviderName", NULL, false, false,
  '{"baseUrl":"http://localhost:11434/v1","model":"qwen2.5:7b"}'::jsonb, now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM "provider_configs" WHERE "name" = 'OLLAMA'::"ProviderName"
);
