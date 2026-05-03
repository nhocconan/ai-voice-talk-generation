/**
 * System health checker — probes every service the app depends on.
 * Used by /admin/system-health and gates for each feature.
 */
import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3"
import Redis from "ioredis"
import { db } from "@/server/db/client"
import { env } from "@/env"

export type HealthStatus = "up" | "down" | "degraded" | "disabled"

export interface ServiceHealth {
  id: string
  label: string
  status: HealthStatus
  required: boolean
  detail?: string | undefined
  supports: string[]
  setupHint?: string | undefined
}

const TIMEOUT_MS = 4000

async function withTimeout<T>(promise: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ])
}

async function probePostgres(): Promise<ServiceHealth> {
  try {
    await withTimeout(db.$queryRaw`SELECT 1`)
    return {
      id: "postgres",
      label: "PostgreSQL database",
      status: "up",
      required: true,
      supports: ["all core features"],
    }
  } catch (e) {
    return {
      id: "postgres",
      label: "PostgreSQL database",
      status: "down",
      required: true,
      detail: String(e),
      supports: ["all core features"],
      setupHint: "Check DATABASE_URL and that the postgres container is running.",
    }
  }
}

async function probeRedis(): Promise<ServiceHealth> {
  let client: Redis | null = null
  try {
    client = new Redis(env.REDIS_URL, { lazyConnect: true, connectTimeout: TIMEOUT_MS, maxRetriesPerRequest: 1 })
    await withTimeout(client.connect())
    const pong = await withTimeout(client.ping())
    if (pong !== "PONG") throw new Error("unexpected ping response")
    return {
      id: "redis",
      label: "Redis (job queue + rate limiting)",
      status: "up",
      required: true,
      supports: ["job queue", "rate limiting", "progress SSE"],
    }
  } catch (e) {
    return {
      id: "redis",
      label: "Redis (job queue + rate limiting)",
      status: "down",
      required: true,
      detail: String(e),
      supports: ["job queue", "rate limiting", "progress SSE"],
      setupHint: "Check REDIS_URL and that the redis container is running.",
    }
  } finally {
    client?.disconnect()
  }
}

async function probeMinio(): Promise<ServiceHealth> {
  try {
    const s3 = new S3Client({
      endpoint: `${env.MINIO_USE_SSL ? "https" : "http"}://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`,
      region: "us-east-1",
      credentials: { accessKeyId: env.MINIO_ACCESS_KEY, secretAccessKey: env.MINIO_SECRET_KEY },
      forcePathStyle: true,
      requestHandler: { requestTimeout: TIMEOUT_MS } as never,
    })
    await withTimeout(s3.send(new ListBucketsCommand({})))
    return {
      id: "minio",
      label: "MinIO object storage",
      status: "up",
      required: true,
      supports: ["voice sample storage", "rendered audio storage", "presigned upload/download"],
    }
  } catch (e) {
    return {
      id: "minio",
      label: "MinIO object storage",
      status: "down",
      required: true,
      detail: String(e),
      supports: ["voice sample storage", "rendered audio storage", "presigned upload/download"],
      setupHint: "Check MINIO_ENDPOINT / MINIO_PORT and that the minio container is running.",
    }
  }
}

async function probeWorker(): Promise<ServiceHealth> {
  const workerUrl = process.env["WORKER_URL"] ?? "http://localhost:8001"
  try {
    const resp = await withTimeout(fetch(`${workerUrl}/healthz`, { cache: "no-store" }))
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const data = await resp.json() as { status?: string; device?: string }
    return {
      id: "worker",
      label: "Python worker (TTS / ASR)",
      status: data.status === "ok" ? "up" : "degraded",
      required: true,
      detail: data.device ? `device=${data.device}` : undefined,
      supports: ["voice enrollment", "audio generation", "transcription", "15-second preview"],
    }
  } catch (e) {
    return {
      id: "worker",
      label: "Python worker (TTS / ASR)",
      status: "down",
      required: true,
      detail: String(e),
      supports: ["voice enrollment", "audio generation", "transcription", "15-second preview"],
      setupHint: "Start the worker with `./scripts/start-dev.sh` or `cd apps/worker && uv run python -m worker.main`.",
    }
  }
}

function probeResend(): ServiceHealth {
  const configured = !!env.RESEND_API_KEY
  return {
    id: "resend",
    label: "Resend email",
    status: configured ? "up" : "disabled",
    required: false,
    supports: ["invite emails", "password reset emails", "quota summary emails"],
    setupHint: configured ? undefined : "Set RESEND_API_KEY in .env.local. Invites will fall back to logging reset URLs.",
  }
}

async function probeGemini(): Promise<ServiceHealth> {
  const apiKey = process.env["GOOGLE_API_KEY"] ?? ""
  if (!apiKey) {
    return {
      id: "gemini",
      label: "Gemini (script drafting, pacing lock, transcript conversion)",
      status: "disabled",
      required: false,
      supports: ["script drafting", "pacing lock", "transcript → timed script"],
      setupHint: "Set GOOGLE_API_KEY in apps/web/.env.local and apps/worker/.env to enable Gemini-backed features.",
    }
  }
  try {
    const resp = await withTimeout(
      fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, { cache: "no-store" }),
      6000,
    )
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    return {
      id: "gemini",
      label: "Gemini (script drafting, pacing lock, transcript conversion)",
      status: "up",
      required: false,
      supports: ["script drafting", "pacing lock", "transcript → timed script"],
    }
  } catch (e) {
    return {
      id: "gemini",
      label: "Gemini (script drafting, pacing lock, transcript conversion)",
      status: "degraded",
      required: false,
      detail: String(e),
      supports: ["script drafting", "pacing lock", "transcript → timed script"],
      setupHint: "GOOGLE_API_KEY is set but the API is unreachable. Verify the key at https://aistudio.google.com/apikey.",
    }
  }
}

async function probeTTSProviders(): Promise<ServiceHealth[]> {
  const providers = await db.providerConfig.findMany({ orderBy: { name: "asc" } })
  const enabledWithKey = providers.filter((p) => {
    if (!p.enabled) return false
    if (p.apiKeyEnc) return true
    return p.name === "VIENEU_TTS" || p.name === "VOXCPM2" || p.name === "XTTS_V2" || p.name === "F5_TTS"
  })

  return [{
    id: "tts-providers",
    label: "TTS providers (at least one enabled)",
    status: enabledWithKey.length > 0 ? "up" : "down",
    required: true,
    detail: `${enabledWithKey.length} of ${providers.length} ready`,
    supports: ["presentation generation", "podcast generation", "re-voice"],
    setupHint: enabledWithKey.length === 0
      ? "Configure at least one TTS provider at /admin/providers."
      : undefined,
  }]
}

export async function runHealthCheck(): Promise<{
  services: ServiceHealth[]
  summary: { ok: number; degraded: number; down: number; disabled: number }
}> {
  const [pg, redis, minio, worker, resend, gemini, providers] = await Promise.all([
    probePostgres().catch((e: unknown): ServiceHealth => ({ id: "postgres", label: "PostgreSQL", status: "down", required: true, supports: [], detail: String(e) })),
    probeRedis().catch((e: unknown): ServiceHealth => ({ id: "redis", label: "Redis", status: "down", required: true, supports: [], detail: String(e) })),
    probeMinio().catch((e: unknown): ServiceHealth => ({ id: "minio", label: "MinIO", status: "down", required: true, supports: [], detail: String(e) })),
    probeWorker().catch((e: unknown): ServiceHealth => ({ id: "worker", label: "Worker", status: "down", required: true, supports: [], detail: String(e) })),
    Promise.resolve(probeResend()),
    probeGemini(),
    probeTTSProviders().catch((): ServiceHealth[] => []),
  ])

  const services = [pg, redis, minio, worker, ...providers, resend, gemini]
  const summary = {
    ok: services.filter((s) => s.status === "up").length,
    degraded: services.filter((s) => s.status === "degraded").length,
    down: services.filter((s) => s.status === "down").length,
    disabled: services.filter((s) => s.status === "disabled").length,
  }
  return { services, summary }
}

/**
 * Feature viability matrix — computed from service health.
 * Used by UI to gate each generation step.
 */
export interface FeatureViability {
  id: string
  label: string
  viable: boolean
  blockedBy: string[]
  degradedBy: string[]
}

export function deriveFeatureMatrix(services: ServiceHealth[]): FeatureViability[] {
  const by = (id: string) => services.find((s) => s.id === id)
  const isUp = (id: string) => by(id)?.status === "up"

  const core = ["postgres", "redis", "minio", "worker", "tts-providers"]
  const coreUp = core.every(isUp)
  const missingCore = core.filter((id) => !isUp(id)).map((id) => by(id)?.label ?? id)

  return [
    {
      id: "voice.enroll",
      label: "Voice profile enrollment",
      viable: isUp("postgres") && isUp("minio") && isUp("worker"),
      blockedBy: ["postgres", "minio", "worker"].filter((id) => !isUp(id)).map((id) => by(id)?.label ?? id),
      degradedBy: [],
    },
    {
      id: "generate.presentation",
      label: "Single-speaker presentation",
      viable: coreUp,
      blockedBy: missingCore,
      degradedBy: [],
    },
    {
      id: "generate.podcast",
      label: "Two-speaker podcast",
      viable: coreUp,
      blockedBy: missingCore,
      degradedBy: !isUp("gemini") ? ["Gemini (pacing lock + transcript conversion disabled)"] : [],
    },
    {
      id: "generate.revoice",
      label: "Re-voice from uploaded audio",
      viable: coreUp,
      blockedBy: missingCore,
      degradedBy: [],
    },
    {
      id: "generate.preview",
      label: "15-second preview",
      viable: isUp("worker") && isUp("minio") && isUp("tts-providers"),
      blockedBy: ["worker", "minio", "tts-providers"].filter((id) => !isUp(id)).map((id) => by(id)?.label ?? id),
      degradedBy: [],
    },
    {
      id: "script.draft",
      label: "Gemini script drafting",
      viable: isUp("gemini"),
      blockedBy: !isUp("gemini") ? ["Gemini API"] : [],
      degradedBy: [],
    },
    {
      id: "script.pacingLock",
      label: "Pacing-lock (Gemini rephrase)",
      viable: isUp("gemini"),
      blockedBy: !isUp("gemini") ? ["Gemini API"] : [],
      degradedBy: [],
    },
    {
      id: "script.transcript",
      label: "Transcript → timed script",
      viable: isUp("gemini"),
      blockedBy: !isUp("gemini") ? ["Gemini API"] : [],
      degradedBy: [],
    },
    {
      id: "auth.invite",
      label: "Invite users via email",
      viable: isUp("postgres"),
      blockedBy: !isUp("postgres") ? ["PostgreSQL"] : [],
      degradedBy: !isUp("resend") ? ["Resend (invite URLs logged to console)"] : [],
    },
    {
      id: "auth.passwordReset",
      label: "Forgot-password email flow",
      viable: isUp("postgres"),
      blockedBy: !isUp("postgres") ? ["PostgreSQL"] : [],
      degradedBy: !isUp("resend") ? ["Resend (reset URLs logged to console)"] : [],
    },
  ]
}
