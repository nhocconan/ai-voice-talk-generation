import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { router, adminProcedure, protectedProcedure } from "@/server/trpc"
import { runHealthCheck, deriveFeatureMatrix } from "@/server/services/health"
import { decryptApiKey, normalizeApiKey } from "@/server/services/crypto"
import { getAccessToken, isConnected } from "@/server/services/xai-oauth"

export const systemRouter = router({
  health: adminProcedure.query(async () => {
    const { services, summary } = await runHealthCheck()
    const features = deriveFeatureMatrix(services)
    return { services, summary, features, checkedAt: new Date().toISOString() }
  }),

  // Lightweight feature-matrix probe for non-admin pages (no secrets leaked)
  features: protectedProcedure.query(async () => {
    const { services } = await runHealthCheck()
    return { features: deriveFeatureMatrix(services) }
  }),

  testProvider: adminProcedure
    .input(z.object({
      id: z.string(),
      // Optional: test with a freshly-entered key before saving
      apiKey: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const provider = await ctx.db.providerConfig.findUniqueOrThrow({ where: { id: input.id } })
      const apiKey = normalizeApiKey(
        input.apiKey ?? (provider.apiKeyEnc ? await decryptApiKey(provider.apiKeyEnc) : ""),
      )

      switch (provider.name) {
        case "ELEVENLABS": {
          if (!apiKey) throw new TRPCError({ code: "BAD_REQUEST", message: "API key required" })
          try {
            const resp = await fetch("https://api.elevenlabs.io/v1/user", {
              headers: { "xi-api-key": apiKey },
            })
            if (!resp.ok) {
              return { ok: false, message: `ElevenLabs returned HTTP ${resp.status}. Check the API key.` }
            }
            const data = await resp.json() as { subscription?: { tier?: string; character_count?: number; character_limit?: number } }
            const tier = data.subscription?.tier ?? "unknown"
            const used = data.subscription?.character_count ?? 0
            const limit = data.subscription?.character_limit ?? 0
            return { ok: true, message: `Live. Plan: ${tier}. Characters used: ${used}/${limit}.` }
          } catch (e) {
            return { ok: false, message: `Could not reach ElevenLabs: ${String(e)}` }
          }
        }

        case "GEMINI_TTS": {
          if (!apiKey) throw new TRPCError({ code: "BAD_REQUEST", message: "API key required" })
          try {
            const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
            if (!resp.ok) {
              return { ok: false, message: `Google returned HTTP ${resp.status}. Verify the key at aistudio.google.com/apikey.` }
            }
            const data = await resp.json() as { models?: Array<{ name: string }> }
            const count = data.models?.length ?? 0
            return { ok: true, message: `Live. ${count} Gemini models reachable.` }
          } catch (e) {
            return { ok: false, message: `Could not reach Google API: ${String(e)}` }
          }
        }

        case "XIAOMI_TTS": {
          if (!apiKey) throw new TRPCError({ code: "BAD_REQUEST", message: "API key required" })
          try {
            const cfg = (provider.config ?? {}) as { baseUrl?: string }
            const configured = (cfg.baseUrl ?? "").trim().replace(/\/$/, "")
            const baseUrl = configured
              || (apiKey.startsWith("tp-")
                ? "https://token-plan-sgp.xiaomimimo.com/v1"
                : "https://api.xiaomimimo.com/v1")
            const resp = await fetch(`${baseUrl}/chat/completions`, {
              method: "POST",
              headers: {
                "api-key": apiKey,
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "mimo-v2.5-tts",
                messages: [
                  { role: "user", content: "Calm tone." },
                  { role: "assistant", content: "ok" },
                ],
                audio: { format: "wav", voice: "Chloe" },
              }),
            })
            if (!resp.ok) {
              const body = await resp.text()
              return { ok: false, message: `Xiaomi MiMo HTTP ${resp.status}: ${body.slice(0, 200)}` }
            }
            return { ok: true, message: "Xiaomi MiMo live (mimo-v2.5-tts)." }
          } catch (e) {
            return { ok: false, message: `Could not reach Xiaomi MiMo: ${String(e)}` }
          }
        }

        case "XAI_TTS": {
          if (!apiKey) throw new TRPCError({ code: "BAD_REQUEST", message: "API key required" })
          try {
            const modelsResp = await fetch("https://api.x.ai/v1/models", {
              headers: { Authorization: `Bearer ${apiKey}` },
            })
            if (!modelsResp.ok) {
              const body = await modelsResp.text()
              return { ok: false, message: `xAI key check failed (HTTP ${modelsResp.status}): ${body.slice(0, 200)}` }
            }

            const resp = await fetch("https://api.x.ai/v1/tts/voices", {
              headers: { Authorization: `Bearer ${apiKey}` },
            })
            if (!resp.ok) {
              const body = await resp.text()
              return { ok: false, message: `xAI key is valid, but TTS voices failed (HTTP ${resp.status}): ${body.slice(0, 200)}` }
            }
            const data = (await resp.json()) as { voices?: unknown[]; data?: unknown[] }
            const voices = data.voices ?? data.data ?? []
            return { ok: true, message: `xAI live. ${voices.length} voices reachable.` }
          } catch (e) {
            return { ok: false, message: `Could not reach xAI: ${String(e)}` }
          }
        }

        case "MINIMAX_TTS": {
          if (!apiKey) throw new TRPCError({ code: "BAD_REQUEST", message: "API key required" })
          try {
            const resp = await fetch("https://api.minimax.io/v1/get_voice", {
              method: "POST",
              headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
              body: JSON.stringify({ voice_type: "voice_cloning" }),
            })
            if (!resp.ok) {
              const body = await resp.text()
              return { ok: false, message: `MiniMax HTTP ${resp.status}: ${body.slice(0, 200)}` }
            }
            const data = (await resp.json()) as {
              base_resp?: { status_code?: number; status_msg?: string }
              voice_cloning?: unknown[]
            }
            if (data.base_resp?.status_code !== 0) {
              return {
                ok: false,
                message: `MiniMax error ${data.base_resp?.status_code}: ${(data.base_resp?.status_msg ?? "").slice(0, 200)}`,
              }
            }
            const count = data.voice_cloning?.length ?? 0
            return { ok: true, message: `MiniMax live. ${count} cloned voice(s) registered.` }
          } catch (e) {
            return { ok: false, message: `Could not reach MiniMax: ${String(e)}` }
          }
        }

        case "GEMINI_LLM": {
          if (!apiKey) throw new TRPCError({ code: "BAD_REQUEST", message: "API key required" })
          try {
            const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)
            if (!resp.ok) {
              return { ok: false, message: `Google returned HTTP ${resp.status}. Verify the key at aistudio.google.com/apikey.` }
            }
            const data = await resp.json() as { models?: Array<{ name: string }> }
            const count = data.models?.length ?? 0
            return { ok: true, message: `Live. ${count} Gemini models reachable.` }
          } catch (e) {
            return { ok: false, message: `Could not reach Google API: ${String(e)}` }
          }
        }

        case "GROQ": {
          if (!apiKey) throw new TRPCError({ code: "BAD_REQUEST", message: "API key required" })
          try {
            const cfg = (provider.config ?? {}) as { baseUrl?: string }
            const baseUrl = (cfg.baseUrl ?? "").trim().replace(/\/$/, "") || "https://api.groq.com/openai/v1"
            const resp = await fetch(`${baseUrl}/models`, {
              headers: { Authorization: `Bearer ${apiKey}` },
            })
            if (!resp.ok) {
              return { ok: false, message: `Groq HTTP ${resp.status}. Check the key at console.groq.com/keys.` }
            }
            const data = (await resp.json()) as { data?: unknown[] }
            return { ok: true, message: `Groq live. ${data.data?.length ?? 0} models reachable.` }
          } catch (e) {
            return { ok: false, message: `Could not reach Groq: ${String(e)}` }
          }
        }

        case "XAI_LLM": {
          if (!apiKey) throw new TRPCError({ code: "BAD_REQUEST", message: "API key required" })
          try {
            const resp = await fetch("https://api.x.ai/v1/models", {
              headers: { Authorization: `Bearer ${apiKey}` },
            })
            if (!resp.ok) {
              return { ok: false, message: `xAI HTTP ${resp.status}. Check the key at console.x.ai.` }
            }
            const data = (await resp.json()) as { data?: unknown[] }
            return { ok: true, message: `xAI live. ${data.data?.length ?? 0} models reachable.` }
          } catch (e) {
            return { ok: false, message: `Could not reach xAI: ${String(e)}` }
          }
        }

        case "GROK_OAUTH": {
          try {
            const cfg = (provider.config ?? {}) as Record<string, unknown>
            if (!isConnected(cfg)) {
              return { ok: false, message: "SuperGrok not connected. Use 'Connect SuperGrok' in Setup & config." }
            }
            const token = await getAccessToken(provider.id, cfg)
            const resp = await fetch("https://api.x.ai/v1/models", {
              headers: { Authorization: `Bearer ${token}` },
            })
            if (!resp.ok) {
              return { ok: false, message: `xAI HTTP ${resp.status}. Try reconnecting SuperGrok.` }
            }
            const data = (await resp.json()) as { data?: unknown[] }
            return { ok: true, message: `SuperGrok live. ${data.data?.length ?? 0} models reachable.` }
          } catch (e) {
            return { ok: false, message: `Could not reach xAI via OAuth: ${String(e)}` }
          }
        }

        case "OLLAMA": {
          try {
            const cfg = (provider.config ?? {}) as { baseUrl?: string }
            const configured = (cfg.baseUrl ?? "").trim()
            const base = configured !== "" ? configured : (process.env["OLLAMA_BASE_URL"] ?? "http://localhost:11434/v1")
            const root = base.replace(/\/v1\/?$/, "").replace(/\/$/, "")
            const resp = await fetch(`${root}/api/tags`)
            if (!resp.ok) {
              return { ok: false, message: `Ollama HTTP ${resp.status}. Is the server running at ${root}?` }
            }
            const data = (await resp.json()) as { models?: unknown[] }
            return { ok: true, message: `Ollama live. ${data.models?.length ?? 0} local models.` }
          } catch (e) {
            return { ok: false, message: `Could not reach Ollama: ${String(e)}. Start it with 'ollama serve'.` }
          }
        }

        case "XTTS_V2":
          return {
            ok: false,
            message:
              "XTTS-v2 support was dropped (stock Coqui model has no Vietnamese). Use MiniMax / xAI / ElevenLabs or VieNeu / VoxCPM2.",
          }

        case "VIENEU_TTS":
        case "VOXCPM2":
        case "F5_TTS":
        case "VIBEVOICE": {
          // Ask worker to synthesize a 2-word test sample
          const workerUrl = process.env["WORKER_URL"] ?? "http://localhost:8001"
          try {
            const resp = await fetch(`${workerUrl}/provider-test`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ provider_id: provider.id }),
            })
            if (!resp.ok) {
              const body = await resp.text()
              return { ok: false, message: `Worker test failed (HTTP ${resp.status}): ${body.slice(0, 200)}` }
            }
            const data = await resp.json() as { ok: boolean; message: string }
            return data
          } catch (e) {
            return { ok: false, message: `Worker unreachable: ${String(e)}. Start the worker via ./scripts/start-dev.sh.` }
          }
        }

        default:
          return { ok: false, message: `No test harness for provider ${provider.name}.` }
      }
    }),
})
