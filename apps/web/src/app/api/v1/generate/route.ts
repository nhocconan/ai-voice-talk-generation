/**
 * P4-05: REST API — POST /api/v1/generate
 * Authenticates via Bearer API key (vk_... prefix), enqueues a PRESENTATION render,
 * and returns { generationId }.
 *
 * Request body:
 *   { profileId: string, script: string, estimatedMinutes: number, providerId?: string }
 *
 * Response:
 *   201 { generationId: string }
 *   400 | 401 | 403 | 429 { error: string }
 */

import { type NextRequest, NextResponse } from "next/server"
import { createHash } from "crypto"
import { db } from "@/server/db/client"
import { enqueueRenderJob } from "@/server/queue/producers"
import { GenKind, GenStatus } from "@prisma/client"
import { checkFixedWindowLimit } from "@/server/services/rate-limit"
import { z } from "zod"

const bodySchema = z.object({
  profileId: z.string().min(1),
  script: z.string().min(10).max(500_000),
  estimatedMinutes: z.number().min(0.1).max(720),
  providerId: z.string().optional(),
})

async function resolveApiKey(authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer vk_")) return null
  const raw = authHeader.slice(7)
  const keyHash = createHash("sha256").update(raw).digest("hex")
  const record = await db.apiKey.findUnique({
    where: { keyHash },
    include: { user: { select: { id: true, active: true, quotaMinutes: true, usedMinutes: true } } },
  })
  if (!record) return null
  if (record.expiresAt && record.expiresAt < new Date()) return null
  if (!record.user.active) return null

  // Update lastUsedAt non-blocking
  db.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined)

  return record
}

export async function POST(req: NextRequest) {
  const apiKeyRecord = await resolveApiKey(req.headers.get("authorization"))
  if (!apiKeyRecord) {
    return NextResponse.json({ error: "Invalid or missing API key" }, { status: 401 })
  }

  const { user } = apiKeyRecord

  // Rate limit: 10 requests/minute per user
  const rl = await checkFixedWindowLimit("api_v1", user.id, 10, 60)
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Validation error" }, { status: 400 })
  }
  const { profileId, script, estimatedMinutes, providerId } = parsed.data

  // Quota check
  if (user.usedMinutes + estimatedMinutes > user.quotaMinutes) {
    return NextResponse.json({ error: "Monthly quota exceeded" }, { status: 403 })
  }

  // Resolve provider
  const provider = providerId
    ? await db.providerConfig.findFirst({ where: { id: providerId, enabled: true } })
    : await db.providerConfig.findFirst({ where: { isDefault: true, enabled: true } })
  if (!provider) {
    return NextResponse.json({ error: "No provider available" }, { status: 400 })
  }

  // Validate profile ownership/access
  const profile = await db.voiceProfile.findFirst({
    where: { id: profileId, OR: [{ ownerId: user.id }, { isOrgShared: true }] },
    include: { samples: { select: { version: true } } },
  })
  if (!profile) {
    return NextResponse.json({ error: "Voice profile not found or not accessible" }, { status: 400 })
  }
  if (!profile.samples.some((s) => s.version === profile.activeVersion)) {
    return NextResponse.json({ error: "Voice profile is still processing" }, { status: 400 })
  }

  const generation = await db.generation.create({
    data: {
      userId: user.id,
      kind: GenKind.PRESENTATION,
      status: GenStatus.QUEUED,
      providerId: provider.id,
      inputScript: script,
      speakers: { create: [{ label: "A", profileId, segments: [] }] },
    },
  })

  await enqueueRenderJob({
    generationId: generation.id,
    providerId: provider.id,
    kind: "PRESENTATION",
    speakers: [{ label: "A", profileId, segments: [], script }],
    output: { mp3: true, wav: true, chapters: false },
    pacingLock: false,
  })

  return NextResponse.json({ generationId: generation.id }, { status: 201 })
}
