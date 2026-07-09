/**
 * W-07: POST /api/v1/generate/podcast — enqueue a PODCAST render (1–2 speakers).
 * Mirrors generation.createPodcast. See docs/ios/02-API-CONTRACT.md.
 */
import { type NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/server/db/client"
import { enqueueRenderJob } from "@/server/queue/producers"
import { writeAuditLog } from "@/server/services/audit"
import { GenKind, GenStatus } from "@prisma/client"
import { apiError, apiOk, mapTrpcError, resolveWriteCaller } from "@/server/api/rest"
import { enforceRenderRateLimit, enforceQuota, enforceGenerationLimit, assertProfilesReady, assertXaiVoiceInputs, resolveProvider } from "@/server/routers/generation"

const segmentSchema = z.object({ startMs: z.number().min(0), endMs: z.number().min(0), text: z.string() })
const speakerSchema = z.object({ label: z.enum(["A", "B"]), profileId: z.string(), segments: z.array(segmentSchema), xaiVoiceId: z.string().trim().max(200).optional() })
const bodySchema = z.object({
  speakers: z.array(speakerSchema).min(1).max(2),
  estimatedMinutes: z.number().min(0.1).max(720),
  pacingLock: z.boolean().optional(),
  providerId: z.string().optional(),
  audiogram: z.boolean().optional(),
  audiogramTitle: z.string().max(120).optional(),
})

function formatMs(ms: number): string {
  const total = Math.floor(ms / 1000)
  return `${Math.floor(total / 60).toString().padStart(2, "0")}:${(total % 60).toString().padStart(2, "0")}`
}

export async function POST(req: NextRequest) {
  const caller = await resolveWriteCaller(req)
  if (caller instanceof Response) return caller
  const user = caller

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return apiError(400, "VALIDATION", "Invalid JSON body")
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) return apiError(400, "VALIDATION", parsed.error.issues[0]?.message ?? "Validation error")
  const input = parsed.data

  try {
    await enforceRenderRateLimit(user.id)
    await enforceQuota({ db, session: { user: { id: user.id } } }, input.estimatedMinutes)
    await enforceGenerationLimit(db, input.estimatedMinutes)
    const providerId = await resolveProvider({ db }, input.providerId)
    await assertProfilesReady(db, input.speakers.map((s) => s.profileId), providerId)
    await assertXaiVoiceInputs(db, providerId, input.speakers.map((speaker) => speaker.xaiVoiceId))

    const script = input.speakers
      .flatMap((s) => s.segments)
      .sort((a, b) => a.startMs - b.startMs)
      .map((seg) => {
        const spk = input.speakers.find((s) => s.segments.includes(seg))
        return `[${formatMs(seg.startMs)} ${spk?.label ?? "A"}] ${seg.text}`
      })
      .join("\n")

    const generation = await db.generation.create({
      data: {
        userId: user.id,
        kind: GenKind.PODCAST,
        status: GenStatus.QUEUED,
        providerId,
        inputScript: script,
        audiogram: input.audiogram ?? false,
        speakers: { create: input.speakers.map((s) => ({ label: s.label, profileId: s.profileId, segments: s.segments })) },
      },
    })

    await enqueueRenderJob({
      generationId: generation.id,
      providerId,
      kind: "PODCAST",
      speakers: input.speakers,
      output: { mp3: true, wav: true, chapters: true, audiogram: input.audiogram ?? false },
      pacingLock: input.pacingLock ?? false,
      ...(input.audiogramTitle ? { audiogramTitle: input.audiogramTitle } : {}),
    })

    await writeAuditLog({ actorId: user.id, action: "generation.create", targetType: "Generation", targetId: generation.id, meta: { kind: "PODCAST", channel: "api", profileIds: input.speakers.map((s) => s.profileId) } })
    return apiOk({ generationId: generation.id }, 201)
  } catch (e) {
    return mapTrpcError(e)
  }
}
