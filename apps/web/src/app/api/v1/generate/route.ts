/**
 * W-07: POST /api/v1/generate — enqueue a PRESENTATION render.
 * Auth: mobile Bearer access token OR legacy `Bearer vk_` API key.
 * Reuses the shared generation guards so behaviour matches the tRPC path.
 * See docs/ios/02-API-CONTRACT.md.
 */
import { type NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/server/db/client"
import { enqueueRenderJob } from "@/server/queue/producers"
import { writeAuditLog } from "@/server/services/audit"
import { GenKind, GenStatus } from "@prisma/client"
import { apiError, apiOk, mapTrpcError, resolveWriteCaller } from "@/server/api/rest"
import {
  enforceRenderRateLimit,
  enforceQuota,
  enforceGenerationLimit,
  assertProfilesReady,
  assertXaiVoiceInputs,
  resolveProvider,
} from "@/server/routers/generation"

const bodySchema = z.object({
  profileId: z.string().min(1),
  script: z.string().min(10).max(500_000),
  estimatedMinutes: z.number().min(0.1).max(720),
  providerId: z.string().optional(),
  xaiVoiceId: z.string().trim().max(200).optional(),
  audiogram: z.boolean().optional(),
  audiogramTitle: z.string().max(120).optional(),
})

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
    await assertProfilesReady(db, [input.profileId], providerId)
    await assertXaiVoiceInputs(db, providerId, [input.xaiVoiceId])

    const generation = await db.generation.create({
      data: {
        userId: user.id,
        kind: GenKind.PRESENTATION,
        status: GenStatus.QUEUED,
        providerId,
        inputScript: input.script,
        audiogram: input.audiogram ?? false,
        speakers: { create: [{ label: "A", profileId: input.profileId, segments: [] }] },
      },
    })

    await enqueueRenderJob({
      generationId: generation.id,
      providerId,
      kind: "PRESENTATION",
      speakers: [{ label: "A", profileId: input.profileId, segments: [], script: input.script, xaiVoiceId: input.xaiVoiceId }],
      output: { mp3: true, wav: true, chapters: false, audiogram: input.audiogram ?? false },
      pacingLock: false,
      ...(input.audiogramTitle ? { audiogramTitle: input.audiogramTitle } : {}),
    })

    await writeAuditLog({ actorId: user.id, action: "generation.create", targetType: "Generation", targetId: generation.id, meta: { kind: "PRESENTATION", channel: "api", profileIds: [input.profileId] } })
    return apiOk({ generationId: generation.id }, 201)
  } catch (e) {
    return mapTrpcError(e)
  }
}
