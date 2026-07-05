/**
 * Provider model catalog adapters.
 *
 * Each adapter calls a provider's list-models endpoint (when one exists) and
 * returns a normalized list. Providers without a public listing endpoint return
 * a curated default list — admins can still edit, enable/disable, and mark
 * favorites in the UI.
 *
 * Used by `admin.fetchProviderModels` to populate the `ProviderModel` table.
 */

import { ProviderName, ModelKind } from "@prisma/client"

export interface CatalogModel {
  modelId: string
  displayName: string
  kind: ModelKind
  languages: string[]
  meta?: Record<string, unknown>
}

export interface CatalogResult {
  models: CatalogModel[]
  source: "remote" | "curated"
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const resp = await fetch(url, init)
  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status} ${resp.statusText}: ${await resp.text().catch(() => "")}`)
  }
  return resp.json()
}

async function geminiCatalog(apiKey: string): Promise<CatalogResult> {
  const data = (await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
  )) as { models?: Array<{ name?: string; displayName?: string; supportedGenerationMethods?: string[] }> }
  const models = (data.models ?? [])
    .filter((m) => (m.supportedGenerationMethods ?? []).some((s) => s.includes("generate") || s.includes("tts")))
    .map<CatalogModel>((m) => ({
      modelId: (m.name ?? "").replace(/^models\//, ""),
      displayName: m.displayName ?? m.name ?? "",
      kind: (m.supportedGenerationMethods ?? []).some((s) => s.includes("audio")) ? "TTS" : "LLM",
      languages: ["en", "vi"],
      meta: { supportedGenerationMethods: m.supportedGenerationMethods ?? [] },
    }))
    .filter((m) => m.modelId)
  return { models, source: "remote" }
}

async function elevenlabsCatalog(apiKey: string): Promise<CatalogResult> {
  const data = (await fetchJson("https://api.elevenlabs.io/v1/models", {
    headers: { "xi-api-key": apiKey },
  })) as Array<{ model_id?: string; name?: string; languages?: Array<{ language_id?: string }> }>
  const models = (Array.isArray(data) ? data : []).map<CatalogModel>((m) => ({
    modelId: m.model_id ?? "",
    displayName: m.name ?? m.model_id ?? "",
    kind: "TTS",
    languages: (m.languages ?? []).map((l) => l.language_id ?? "").filter(Boolean),
  }))
  return { models, source: "remote" }
}

async function xaiCatalog(apiKey: string): Promise<CatalogResult> {
  // xAI publishes an OpenAI-compatible /models endpoint.
  const data = (await fetchJson("https://api.x.ai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  })) as { data?: Array<{ id?: string }> }
  const models = (data.data ?? [])
    .filter((m) => m.id)
    .map<CatalogModel>((m) => ({
      modelId: m.id ?? "",
      displayName: m.id ?? "",
      kind: (m.id ?? "").includes("tts") || (m.id ?? "").includes("audio") ? "TTS" : "LLM",
      languages: ["en"],
    }))
  return { models, source: "remote" }
}

// LLM catalogs — all return kind=LLM models for the draft-script feature.

async function geminiLlmCatalog(apiKey: string): Promise<CatalogResult> {
  const data = (await fetchJson(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
  )) as { models?: Array<{ name?: string; displayName?: string; supportedGenerationMethods?: string[] }> }
  const models = (data.models ?? [])
    .filter((m) => (m.supportedGenerationMethods ?? []).some((s) => s.includes("generateContent")))
    .map<CatalogModel>((m) => ({
      modelId: (m.name ?? "").replace(/^models\//, ""),
      displayName: m.displayName ?? m.name ?? "",
      kind: "LLM",
      languages: ["vi", "en"],
    }))
    .filter((m) => m.modelId)
  return { models, source: "remote" }
}

async function openAiCompatCatalog(base: string, apiKey: string | null): Promise<CatalogResult> {
  const headers: Record<string, string> = {}
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`
  const data = (await fetchJson(`${base.replace(/\/$/, "")}/models`, { headers })) as {
    data?: Array<{ id?: string }>
  }
  const models = (data.data ?? [])
    .filter((m) => m.id)
    .map<CatalogModel>((m) => ({
      modelId: m.id ?? "",
      displayName: m.id ?? "",
      kind: "LLM",
      languages: ["en", "vi"],
    }))
  return { models, source: "remote" }
}

async function ollamaCatalog(base: string): Promise<CatalogResult> {
  // Ollama's native tags endpoint lives at /api/tags (one level above the /v1 base).
  const root = base.replace(/\/v1\/?$/, "").replace(/\/$/, "")
  const data = (await fetchJson(`${root}/api/tags`)) as { models?: Array<{ name?: string }> }
  const models = (data.models ?? [])
    .filter((m) => m.name)
    .map<CatalogModel>((m) => ({
      modelId: m.name ?? "",
      displayName: m.name ?? "",
      kind: "LLM",
      languages: ["en", "vi"],
    }))
  return { models, source: "remote" }
}

// Curated defaults for providers that don't have a public listing endpoint or
// where a stable, opinionated catalog is more useful than the raw API output.
const CURATED: Partial<Record<ProviderName, CatalogModel[]>> = {
  VIENEU_TTS: [
    { modelId: "vieneu-v1", displayName: "VieNeu v1 (Vietnamese)", kind: "TTS", languages: ["vi"] },
  ],
  VOXCPM2: [
    {
      modelId: "voxcpm-2",
      displayName: "VoxCPM 2 (multilingual)",
      kind: "TTS",
      languages: ["vi", "en", "zh"],
    },
  ],
  XTTS_V2: [
    { modelId: "xtts-v2", displayName: "XTTS v2", kind: "TTS", languages: ["en", "vi", "es", "fr"] },
  ],
  F5_TTS: [
    { modelId: "f5-tts", displayName: "F5-TTS", kind: "TTS", languages: ["en", "zh"] },
  ],
  VIBEVOICE: [
    { modelId: "vibevoice-base", displayName: "VibeVoice base", kind: "TTS", languages: ["vi", "en"] },
  ],
  XIAOMI_TTS: [
    {
      modelId: "mimo-tts-large",
      displayName: "Xiaomi MiMo TTS large",
      kind: "TTS",
      languages: ["en", "zh", "vi"],
    },
    {
      modelId: "mimo-tts-fast",
      displayName: "Xiaomi MiMo TTS fast",
      kind: "TTS",
      languages: ["en", "zh"],
    },
  ],
  GEMINI_LLM: [
    { modelId: "gemini-2.5-flash", displayName: "Gemini 2.5 Flash", kind: "LLM", languages: ["vi", "en"] },
    { modelId: "gemini-2.5-pro", displayName: "Gemini 2.5 Pro", kind: "LLM", languages: ["vi", "en"] },
  ],
  GROQ: [
    { modelId: "llama-3.3-70b-versatile", displayName: "Llama 3.3 70B Versatile", kind: "LLM", languages: ["en", "vi"] },
    { modelId: "llama-3.1-8b-instant", displayName: "Llama 3.1 8B Instant", kind: "LLM", languages: ["en", "vi"] },
  ],
  XAI_LLM: [
    { modelId: "grok-4.3", displayName: "Grok 4.3", kind: "LLM", languages: ["en", "vi"] },
  ],
  GROK_OAUTH: [
    { modelId: "grok-4.3", displayName: "Grok 4.3", kind: "LLM", languages: ["en", "vi"] },
  ],
  OLLAMA: [
    { modelId: "qwen2.5:7b", displayName: "Qwen 2.5 7B", kind: "LLM", languages: ["en", "vi", "zh"] },
    { modelId: "llama3.1:8b", displayName: "Llama 3.1 8B", kind: "LLM", languages: ["en", "vi"] },
  ],
}

export async function fetchProviderCatalog(
  name: ProviderName,
  apiKey: string | null,
  config?: Record<string, unknown> | null,
): Promise<CatalogResult> {
  const baseUrl = String(config?.["baseUrl"] ?? "").trim()
  try {
    if (name === "GEMINI_TTS" && apiKey) return await geminiCatalog(apiKey)
    if (name === "ELEVENLABS" && apiKey) return await elevenlabsCatalog(apiKey)
    if (name === "XAI_TTS" && apiKey) return await xaiCatalog(apiKey)
    if (name === "GEMINI_LLM" && apiKey) return await geminiLlmCatalog(apiKey)
    if (name === "GROQ" && apiKey) {
      return await openAiCompatCatalog(baseUrl || "https://api.groq.com/openai/v1", apiKey)
    }
    if (name === "XAI_LLM" && apiKey) {
      return await openAiCompatCatalog(baseUrl || "https://api.x.ai/v1", apiKey)
    }
    if (name === "OLLAMA") {
      const ollamaBase = baseUrl !== "" ? baseUrl : (process.env["OLLAMA_BASE_URL"] ?? "http://localhost:11434/v1")
      return await ollamaCatalog(ollamaBase)
    }
  } catch {
    // Fall through to curated list when the remote API is unreachable.
  }

  const curated = CURATED[name] ?? []
  return { models: curated, source: "curated" }
}
