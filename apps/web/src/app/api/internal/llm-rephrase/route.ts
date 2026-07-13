/**
 * Internal pacing-lock rephrase hook. The worker calls this per segment when
 * pacingLock is enabled so rephrasing runs through whatever LLM provider the
 * deployment has configured (Gemini / Grok / Groq / xAI / Ollama) instead of
 * being hard-wired to env GOOGLE_API_KEY Gemini.
 *
 * Auth: shared secret in `x-internal-token` (env INTERNAL_API_TOKEN, falling
 * back to SERVER_SECRET) — same scheme as /api/internal/job-complete.
 */
import { type NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { z } from "zod"
import { env } from "@/env"
import { db } from "@/server/db/client"
import { completeWithProvider } from "@/server/services/llm"
import { resolveLlmProvider } from "@/server/routers/generation"

// Env-Gemini fallback model. Mirrors GEMINI_TEXT_MODEL used elsewhere in web.
const GEMINI_TEXT_MODEL = process.env["GEMINI_TEXT_MODEL"] ?? "gemini-2.5-flash"

const bodySchema = z.object({
  text: z.string().min(1).max(8000),
  targetMs: z.number().positive(),
  lang: z.enum(["vi", "en"]),
})

function tokenOk(provided: string | null): boolean {
  const expected = process.env["INTERNAL_API_TOKEN"] ?? env.SERVER_SECRET
  if (!provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function buildPrompt(text: string, targetMs: number, lang: "vi" | "en"): string {
  const targetSeconds = Math.floor(targetMs / 1000)
  const targetWords = Math.floor((targetMs / 1000) * 150 / 60) // 150 wpm
  const minWords = Math.floor(targetWords * 0.95)
  const maxWords = Math.floor(targetWords * 1.05)
  return lang === "en"
    ? `Rewrite the following text so that when read aloud at normal speaking pace it takes approximately ${targetSeconds} seconds (${minWords}–${maxWords} words). Preserve the meaning and tone. Return only the rewritten text.\n\nOriginal:\n${text}`
    : `Viết lại đoạn văn sau để khi đọc to mất khoảng ${targetSeconds} giây (${minWords}–${maxWords} từ). Giữ nguyên ý nghĩa và giọng điệu. Chỉ trả về văn bản đã viết lại.\n\nGốc:\n${text}`
}

async function geminiRephraseEnv(prompt: string): Promise<string | null> {
  const apiKey = process.env["GOOGLE_API_KEY"]
  if (!apiKey) return null
  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
        }),
      },
    )
    if (!resp.ok) return null
    const data = (await resp.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    return (data.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim()
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  if (!tokenOk(req.headers.get("x-internal-token"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  const { text: original, targetMs, lang } = parsed.data

  const prompt = buildPrompt(original, targetMs, lang)

  // 1. Any configured LLM provider.
  const llm = await resolveLlmProvider(db, undefined, undefined).catch(() => null)
  let rephrased: string | null = null
  if (llm) {
    try {
      rephrased = (
        await completeWithProvider({
          providerName: llm.providerName,
          providerId: llm.providerId,
          apiKeyEnc: llm.apiKeyEnc,
          config: llm.config,
          model: llm.model,
          system: "Return only the rewritten text.",
          prompt,
          temperature: 0.4,
          maxTokens: 1024,
        })
      ).trim()
    } catch {
      rephrased = null // fall through to env Gemini
    }
  }

  // 2. Env-Gemini fallback when there is no provider or the provider failed.
  if (rephrased === null || rephrased === "") {
    const gem = await geminiRephraseEnv(prompt)
    if (gem !== null) rephrased = gem
  }

  // 3. Neither configured → let the worker degrade to the original text.
  if (rephrased === null) {
    return NextResponse.json({ error: "No LLM configured" }, { status: 503 })
  }

  // Success — empty model output degrades to the original text.
  return NextResponse.json({ text: rephrased === "" ? original : rephrased })
}
