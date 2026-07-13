import Redis from "ioredis"
import { env } from "@/env"

export interface JobProgressSnapshot {
  phase: string
  progress: number
  message: string
  ts: string
}

export function parseJobProgress(value: string | null): JobProgressSnapshot | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<JobProgressSnapshot>
    if (
      typeof parsed.phase !== "string" ||
      typeof parsed.progress !== "number" ||
      !Number.isFinite(parsed.progress) ||
      typeof parsed.message !== "string" ||
      typeof parsed.ts !== "string"
    ) {
      return null
    }
    return {
      phase: parsed.phase,
      progress: Math.max(0, Math.min(1, parsed.progress)),
      message: parsed.message,
      ts: parsed.ts,
    }
  } catch {
    return null
  }
}

export async function getJobProgress(generationId: string): Promise<JobProgressSnapshot | null> {
  const redis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 })
  try {
    await redis.connect()
    return parseJobProgress(await redis.get(`job:${generationId}:progress`))
  } catch {
    return null
  } finally {
    redis.disconnect()
  }
}
