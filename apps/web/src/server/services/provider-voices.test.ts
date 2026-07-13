import { beforeEach, describe, expect, it, vi } from "vitest"
import { ProviderName } from "@prisma/client"

vi.mock("@/server/services/crypto", () => ({
  decryptApiKey: vi.fn(() => Promise.resolve("test-key")),
  normalizeApiKey: vi.fn((value: string) => value),
}))

import { validateProviderVoiceId } from "./provider-voices"

describe("validateProviderVoiceId", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it("accepts an xAI voice returned by the account voice catalog", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ voices: [{ voice_id: "voice-x" }] }), { status: 200 }))))

    await expect(validateProviderVoiceId({
      provider: ProviderName.XAI_TTS,
      apiKeyEnc: "encrypted",
      voiceId: "voice-x",
    })).resolves.toBeUndefined()
  })

  it("accepts a MiniMax cloned voice returned by get_voice", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({
      voice_cloning: [{ voice_id: "MiniMax001" }],
      base_resp: { status_code: 0 },
    }), { status: 200 }))))

    await expect(validateProviderVoiceId({
      provider: ProviderName.MINIMAX_TTS,
      apiKeyEnc: "encrypted",
      voiceId: "MiniMax001",
    })).resolves.toBeUndefined()
  })

  it("accepts an ElevenLabs voice available to the configured account", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ voice_id: "eleven-voice" }), { status: 200 })))
    vi.stubGlobal("fetch", fetchMock)

    await expect(validateProviderVoiceId({
      provider: ProviderName.ELEVENLABS,
      apiKeyEnc: "encrypted",
      voiceId: "eleven-voice",
    })).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.elevenlabs.io/v1/voices/eleven-voice",
      expect.objectContaining({ headers: { "xi-api-key": "test-key" } }),
    )
  })

  it("rejects a voice that is not available to the provider account", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify({ voices: [] }), { status: 200 }))))

    await expect(validateProviderVoiceId({
      provider: ProviderName.XAI_TTS,
      apiKeyEnc: "encrypted",
      voiceId: "missing",
    })).rejects.toThrow("not available")
  })
})
