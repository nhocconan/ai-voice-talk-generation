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

  it("accepts an xAI custom voice owned by the configured team", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({ voice_id: "e7egckrk" }), { status: 200 })))
    vi.stubGlobal("fetch", fetchMock)

    await expect(validateProviderVoiceId({
      provider: ProviderName.XAI_TTS,
      apiKeyEnc: "encrypted",
      voiceId: "e7egckrk",
    })).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.x.ai/v1/custom-voices/e7egckrk",
      expect.objectContaining({ headers: { Authorization: "Bearer test-key" } }),
    )
  })

  it("falls back to xAI's built-in voice endpoint", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ voice_id: "eve" }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    await expect(validateProviderVoiceId({
      provider: ProviderName.XAI_TTS,
      apiKeyEnc: "encrypted",
      voiceId: "eve",
    })).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenLastCalledWith(
      "https://api.x.ai/v1/tts/voices/eve",
      expect.any(Object),
    )
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
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(null, { status: 404 }))))

    await expect(validateProviderVoiceId({
      provider: ProviderName.XAI_TTS,
      apiKeyEnc: "encrypted",
      voiceId: "missing",
    })).rejects.toThrow("not available")
  })
})
