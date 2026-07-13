import { ProviderName } from "@prisma/client"
import { decryptApiKey, normalizeApiKey } from "@/server/services/crypto"

export const NATIVE_VOICE_PROVIDERS = [
  ProviderName.XAI_TTS,
  ProviderName.MINIMAX_TTS,
  ProviderName.ELEVENLABS,
] as const

export type NativeVoiceProvider = (typeof NATIVE_VOICE_PROVIDERS)[number]

interface VoiceValidationInput {
  provider: NativeVoiceProvider
  apiKeyEnc: string
  voiceId: string
}

export async function validateProviderVoiceId({ provider, apiKeyEnc, voiceId }: VoiceValidationInput): Promise<void> {
  const apiKey = normalizeApiKey(await decryptApiKey(apiKeyEnc))
  const id = voiceId.trim()
  let response: Response

  if (provider === ProviderName.ELEVENLABS) {
    response = await fetch(`https://api.elevenlabs.io/v1/voices/${encodeURIComponent(id)}`, {
      headers: { "xi-api-key": apiKey },
      signal: AbortSignal.timeout(15_000),
    })
    if (response.ok) return
  } else if (provider === ProviderName.MINIMAX_TTS) {
    response = await fetch("https://api.minimax.io/v1/get_voice", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ voice_type: "all" }),
      signal: AbortSignal.timeout(15_000),
    })
    if (response.ok) {
      const payload = await response.json() as Record<string, unknown>
      const base = isRecord(payload["base_resp"]) ? payload["base_resp"] : {}
      const statusCode = typeof base["status_code"] === "number" ? base["status_code"] : -1
      const lists = [payload["voice_cloning"], payload["voice_generation"], payload["system_voice"]]
      const exists = lists.some((list) => Array.isArray(list) && list.some((voice) => isRecord(voice) && voice["voice_id"] === id))
      if (statusCode === 0 && exists) return
    }
  } else {
    const headers = { Authorization: `Bearer ${apiKey}` }
    response = await fetch(`https://api.x.ai/v1/custom-voices/${encodeURIComponent(id)}`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    })
    if (response.ok) return

    response = await fetch(`https://api.x.ai/v1/tts/voices/${encodeURIComponent(id)}`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    })
    if (response.ok) return
  }

  throw new Error(`${provider} Voice ID is not available to the configured provider account.`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
