import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { router, adminProcedure, protectedProcedure } from "@/server/trpc"
import { runHealthCheck, deriveFeatureMatrix } from "@/server/services/health"
import { decryptApiKey } from "@/server/services/crypto"

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
      const apiKey = input.apiKey
        ?? (provider.apiKeyEnc ? await decryptApiKey(provider.apiKeyEnc) : "")

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
            const resp = await fetch("https://api.x.ai/v1/tts/voices", {
              headers: { Authorization: `Bearer ${apiKey}` },
            })
            if (!resp.ok) {
              const body = await resp.text()
              return { ok: false, message: `xAI HTTP ${resp.status}: ${body.slice(0, 200)}` }
            }
            const data = (await resp.json()) as { voices?: unknown[]; data?: unknown[] }
            const voices = data.voices ?? data.data ?? []
            return { ok: true, message: `xAI live. ${voices.length} voices reachable.` }
          } catch (e) {
            return { ok: false, message: `Could not reach xAI: ${String(e)}` }
          }
        }

        case "VIENEU_TTS":
        case "VOXCPM2":
        case "XTTS_V2":
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
