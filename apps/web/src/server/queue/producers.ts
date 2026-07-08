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

export async function enqueueRenderJob(data: RenderJobData): Promise<string> {
  return enqueueStreamJob("render", "render.generation", data)
}

export async function enqueueAsrJob(data: AsrJobData): Promise<string> {
  return enqueueStreamJob("asr", "asr.diarize", data)
}

export async function enqueueVideoRevoiceJob(data: VideoRevoiceJobData): Promise<string> {
  return enqueueStreamJob("video_revoice", "render.video_revoice", data)
}
