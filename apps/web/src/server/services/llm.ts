/**
 * LLM client for the "draft script" feature.
 *
 * Routes a drafting prompt to the selected LLM provider:
 *   - GEMINI_LLM             → native generateContent REST
 *   - GROQ / XAI_LLM / OLLAMA → OpenAI-compatible /chat/completions
 *   - GROK_OAUTH             → OpenAI-compatible /chat/completions on api.x.ai,
 *                              bearer from a fresh SuperGrok OAuth access token
 *
 * Hard guard: xAI bearer tokens (XAI_LLM API keys and GROK_OAUTH access tokens)
 * are only ever sent to https://api.x.ai.
 */

import { ProviderName } from "@prisma/client"
import { decryptApiKey } from "@/server/services/crypto"
import { getAccessToken } from "@/server/services/xai-oauth"

const TEMPERATURE = 0.7
const MAX_TOKENS = 4096

export interface DraftLlmOptions {
  providerName: ProviderName
  providerId: string
  apiKeyEnc: string | null
  config: Record<string, unknown>
  model: string
  prompt: string
}

export async function draftScriptWithProvider(opts: DraftLlmOptions): Promise<string> {
  switch (opts.providerName) {
    case "GEMINI_LLM":
      return geminiGenerate(opts)
    case "GROQ":
    case "XAI_LLM":
    case "OLLAMA":
      return openAiCompatChat(opts)
    case "GROK_OAUTH":
      return grokOauthChat(opts)
    default:
      throw new Error(`Provider ${opts.providerName} is not an LLM provider`)
  }
}

async function geminiGenerate(opts: DraftLlmOptions): Promise<string> {
  const apiKey = opts.apiKeyEnc ? await decryptApiKey(opts.apiKeyEnc) : ""
  if (!apiKey) throw new Error("Gemini API key not configured")
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: opts.prompt }] }],
        generationConfig: { temperature: TEMPERATURE, maxOutputTokens: MAX_TOKENS },
      }),
    },
  )
  if (!resp.ok) throw new Error(`Gemini HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`)
  const data = (await resp.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
  if (!text) throw new Error("Empty response from Gemini")
  return text.trim()
}

function resolveBaseUrl(opts: DraftLlmOptions): string {
  const configured = String(opts.config?.["baseUrl"] ?? "").trim().replace(/\/$/, "")
  if (configured) return configured
  switch (opts.providerName) {
    case "GROQ":
      return "https://api.groq.com/openai/v1"
    case "XAI_LLM":
      return "https://api.x.ai/v1"
    case "OLLAMA":
      return process.env["OLLAMA_BASE_URL"] ?? "http://localhost:11434/v1"
    default:
      throw new Error(`No base URL for provider ${opts.providerName}`)
  }
}

// xAI bearer tokens may only ever be sent to https://api.x.ai.
function assertXaiBase(base: string): void {
  const u = new URL(base)
  if (u.protocol !== "https:" || u.hostname !== "api.x.ai") {
    throw new Error("xAI bearer token may only be sent to https://api.x.ai")
  }
}

async function openAiCompatChat(opts: DraftLlmOptions): Promise<string> {
  const base = resolveBaseUrl(opts)
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (opts.providerName !== "OLLAMA") {
    const apiKey = opts.apiKeyEnc ? await decryptApiKey(opts.apiKeyEnc) : ""
    if (!apiKey) throw new Error(`${opts.providerName} API key not configured`)
    if (opts.providerName === "XAI_LLM") assertXaiBase(base)
    headers["Authorization"] = `Bearer ${apiKey}`
  }
  return chatCompletion(base, headers, opts.model, opts.prompt)
}

async function grokOauthChat(opts: DraftLlmOptions): Promise<string> {
  const base = "https://api.x.ai/v1" // hard-pinned for OAuth bearer
  const token = await getAccessToken(opts.providerId, opts.config)
  return chatCompletion(
    base,
    { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    opts.model,
    opts.prompt,
  )
}

async function chatCompletion(
  base: string,
  headers: Record<string, string>,
  model: string,
  prompt: string,
): Promise<string> {
  const resp = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS,
    }),
  })
  if (!resp.ok) {
    throw new Error(`${new URL(base).hostname} HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`)
  }
  const data = (await resp.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const text = data.choices?.[0]?.message?.content ?? ""
  if (!text) throw new Error("Empty response from provider")
  return text.trim()
}
