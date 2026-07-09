import Redis from "ioredis"
import type {
  AsrJobData,
  IngestJobData,
  RenderJobData,
  VideoRevoiceJobData,
} from "@contracts/jobs"
import { env } from "@/env"

// lazyConnect so importing this module (incl. at next build "collect page data"
// time) does not open a TCP connection — it connects on first command instead.
const redis = new Redis(env.REDIS_URL, { lazyConnect: true })

async function enqueueStreamJob(
  stream: "ingest" | "render" | "asr" | "video_revoice",
  jobName: string,
  data: object,
): Promise<string> {
  return (await redis.xadd(stream, "*", "job", jobName, "payload", JSON.stringify(data))) ?? ""
}

export async function enqueueIngestJob(data: IngestJobData): Promise<string> {
  return enqueueStreamJob("ingest", "ingest.enroll", data)
}

export async function allocateVoiceSampleVersion(profileId: string, latestVersion: number): Promise<number> {
  const key = `voice-profile:${profileId}:sample-version`
  const next = await redis.eval(
    `
      local current = tonumber(redis.call("GET", KEYS[1]) or "0")
      local latest = tonumber(ARGV[1])
      if current < latest then
        current = latest
      end
      current = current + 1
      redis.call("SET", KEYS[1], current)
      return current
    `,
    1,
    key,
    latestVersion,
  )
  return Number(next)
}

export async function enqueueRenderJob(data: RenderJobData): Promise<string> {
  return enqueueStreamJob("render", "render.generation", data)
}

export async function enqueueAsrJob(data: AsrJobData): Promise<string> {
  return enqueueStreamJob("asr", "asr.diarize", data)
}

export async function enqueueVideoRevoiceJob(data: VideoRevoiceJobData): Promise<string> {
  return enqueueStreamJob("video_revoice", "render.video_revoice", data)
}
