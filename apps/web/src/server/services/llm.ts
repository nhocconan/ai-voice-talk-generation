/**
 * LLM client for the "draft script" feature.
 *
 * Routes a drafting prompt to the selected LLM provider:
 *   - GEMINI_LLM             → native generateContent REST
 *   - GROQ / XAI_LLM         → OpenAI-compatible /chat/completions
 *   - OLLAMA                 → native /api/chat with think:false
 *                              (OpenAI-compat leaves thinking models' output
 *                              in `reasoning` and an empty `content` — unusable
 *                              as a presentation script)
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

/** Forced on every draft call so thinking models don't dump chain-of-thought. */
const DRAFT_SYSTEM = [
  "You are a speechwriter for live presentations and podcasts.",
  "Return ONLY the final script text that a speaker will read aloud.",
  "Do NOT include planning, analysis, drafts, word counts, bullet outlines,",
  "titles, markdown headings, or meta commentary.",
  "Do NOT narrate your reasoning. Output the spoken script and nothing else.",
].join(" ")

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
      return openAiCompatChat(opts)
    case "OLLAMA":
      return ollamaNativeChat(opts)
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
        // Prepend system instructions into the single user turn (Gemini REST
        // path used here has no separate system role in older models).
        contents: [{ parts: [{ text: `${DRAFT_SYSTEM}\n\n${opts.prompt}` }] }],
        generationConfig: { temperature: TEMPERATURE, maxOutputTokens: MAX_TOKENS },
      }),
    },
  )
  if (!resp.ok) throw new Error(`Gemini HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`)
  const data = (await resp.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
  return finalizeScript(text, "Gemini")
}

/**
 * Normalize OpenAI-compatible base so `${base}/chat/completions` is valid.
 * Ollama operators often paste `http://localhost:11434` (native root) instead of
 * `http://localhost:11434/v1` — without this, requests hit /chat/completions → 404.
 */
function normalizeOpenAiCompatBase(base: string, providerName: ProviderName): string {
  let cleaned = base.trim().replace(/\/+$/, "")
  cleaned = cleaned.replace(/\/chat\/completions$/i, "").replace(/\/+$/, "")
  if (providerName === "OLLAMA") {
    if (!/\/v1$/i.test(cleaned)) {
      cleaned = `${cleaned}/v1`
    }
  }
  return cleaned
}

function resolveBaseUrl(opts: DraftLlmOptions): string {
  const configured = String(opts.config?.["baseUrl"] ?? "").trim()
  if (configured) return normalizeOpenAiCompatBase(configured, opts.providerName)
  switch (opts.providerName) {
    case "GROQ":
      return "https://api.groq.com/openai/v1"
    case "XAI_LLM":
      return "https://api.x.ai/v1"
    case "OLLAMA":
      return normalizeOpenAiCompatBase(
        process.env["OLLAMA_BASE_URL"] ?? "http://localhost:11434/v1",
        "OLLAMA",
      )
    default:
      throw new Error(`No base URL for provider ${opts.providerName}`)
  }
}

function ollamaRootFromBase(base: string): string {
  return base.replace(/\/v1$/i, "").replace(/\/+$/, "")
}

// xAI bearer tokens may only ever be sent to https://api.x.ai.
function assertXaiBase(base: string): void {
  const u = new URL(base)
  if (u.protocol !== "https:" || u.hostname !== "api.x.ai") {
    throw new Error("xAI bearer token may only be sent to https://api.x.ai")
  }
}

/**
 * Ollama native chat. Uses `think: false` so reasoning models (Kimi, R1, Qwen3…)
 * write the script into `message.content` instead of burning tokens on CoT.
 * The OpenAI-compat path does not honor think:false reliably for cloud tags.
 */
async function ollamaNativeChat(opts: DraftLlmOptions): Promise<string> {
  const root = ollamaRootFromBase(resolveBaseUrl(opts))
  const url = `${root}/api/chat`
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model,
      stream: false,
      think: false,
      messages: [
        { role: "system", content: DRAFT_SYSTEM },
        { role: "user", content: opts.prompt },
      ],
      options: {
        temperature: TEMPERATURE,
        num_predict: MAX_TOKENS,
      },
    }),
  })
  if (!resp.ok) {
    const body = (await resp.text()).slice(0, 200)
    throw new Error(`Ollama HTTP ${resp.status} (${url}): ${body}`)
  }
  const data = (await resp.json()) as {
    message?: { content?: string | null; thinking?: string | null }
  }
  // Never use `thinking` / reasoning as the script — that is CoT, not speech.
  return finalizeScript(data.message?.content ?? "", "Ollama")
}

async function openAiCompatChat(opts: DraftLlmOptions): Promise<string> {
  const base = resolveBaseUrl(opts)
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  const apiKey = opts.apiKeyEnc ? await decryptApiKey(opts.apiKeyEnc) : ""
  if (!apiKey) throw new Error(`${opts.providerName} API key not configured`)
  if (opts.providerName === "XAI_LLM") assertXaiBase(base)
  headers["Authorization"] = `Bearer ${apiKey}`
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
  const url = `${base}/chat/completions`
  const resp = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: DRAFT_SYSTEM },
        { role: "user", content: prompt },
      ],
      temperature: TEMPERATURE,
      max_tokens: MAX_TOKENS,
    }),
  })
  if (!resp.ok) {
    const body = (await resp.text()).slice(0, 200)
    throw new Error(`${new URL(base).hostname} HTTP ${resp.status} (${url}): ${body}`)
  }
  const data = (await resp.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null
      }
    }>
  }
  // Intentionally ignore reasoning / reasoning_content — those are CoT traces.
  return finalizeScript(data.choices?.[0]?.message?.content ?? "", "provider")
}

/** Strip think-tags / fences and reject pure chain-of-thought dumps. */
function finalizeScript(raw: string, label: string): string {
  let text = (raw ?? "").trim()
  if (!text) {
    throw new Error(
      `Empty script from ${label}. If this is a thinking model (Kimi/R1/Qwen3), the app now uses Ollama think:false — re-run draft, or pick a non-thinking model.`,
    )
  }

  // Common thinking wrappers some models still leak into content.
  text = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/```(?:text|markdown|script)?\s*([\s\S]*?)```/gi, "$1")
    .trim()

  if (!text) {
    throw new Error(`Empty script from ${label} after stripping thinking blocks`)
  }

  // Heuristic: pure CoT dumps look like planning, not a speakable script.
  if (looksLikeChainOfThought(text)) {
    const recovered = extractLikelyScript(text)
    if (recovered) return recovered
    throw new Error(
      `${label} returned analysis instead of a script. Retry draft, or use a non-thinking model.`,
    )
  }

  return text
}

function looksLikeChainOfThought(text: string): boolean {
  const markers = [
    /đếm từ/i,
    /word count/i,
    /dự thảo/i,
    /tôi cần/i,
    /người dùng yêu cầu/i,
    /the user (asked|wants|requested)/i,
    /let me (think|draft|count)/i,
    /i need to (write|calculate|count)/i,
    /chỉ có \d+ từ/i,
    /mở rộng thêm/i,
  ]
  const hits = markers.filter((re) => re.test(text)).length
  // Long dump with multiple planning markers → CoT, not speech.
  return hits >= 2 || (hits >= 1 && text.length > 1200 && /\n.*\n.*\n/.test(text))
}

/** Last-ditch: pull the longest quoted paragraph that looks speakable. */
function extractLikelyScript(text: string): string | null {
  const quoted = [...text.matchAll(/"([^"]{80,})"/g)].map((m) => m[1]!.trim())
  const candidates = quoted.filter((q) => !looksLikeChainOfThought(q))
  if (candidates.length === 0) return null
  candidates.sort((a, b) => b.length - a.length)
  return candidates[0] ?? null
}
