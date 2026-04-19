import { Queue } from "bullmq"
import { env } from "@/env"

const connection = {
  url: env.REDIS_URL,
}

const renderQueue = new Queue("render", { connection })
const ingestQueue = new Queue("ingest", { connection })
const asrQueue = new Queue("asr", { connection })

export interface IngestJobData {
  profileId: string
  storageKey: string
  version: number
  userId: string
  notes?: string
}

export interface RenderJobData {
  generationId: string
  providerId: string
  kind: "PRESENTATION" | "PODCAST" | "REVOICE"
  speakers: Array<{
    label: string
    profileId: string
    segments: Array<{ startMs: number; endMs: number; text: string }>
  }>
  output: { mp3: boolean; wav: boolean; chapters: boolean }
  pacingLock: boolean
}

export interface AsrJobData {
  generationId: string
  sourceKey: string
  expectedSpeakers: number
}

export async function enqueueIngestJob(data: IngestJobData): Promise<string> {
  const job = await ingestQueue.add("ingest.enroll", data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
  })
  return job.id ?? ""
}

export async function enqueueRenderJob(data: RenderJobData): Promise<string> {
  const job = await renderQueue.add("render.generation", data, {
    attempts: 3,
    backoff: { type: "exponential", delay: 10000 },
  })
  return job.id ?? ""
}

export async function enqueueAsrJob(data: AsrJobData): Promise<string> {
  const job = await asrQueue.add("asr.diarize", data, {
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
  })
  return job.id ?? ""
}

export { renderQueue, ingestQueue, asrQueue }
