import Redis from "ioredis"
import type { AsrJobData, IngestJobData, RenderJobData } from "@contracts/jobs"
import { env } from "@/env"

const redis = new Redis(env.REDIS_URL)

async function enqueueStreamJob(
  stream: "ingest" | "render" | "asr",
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
