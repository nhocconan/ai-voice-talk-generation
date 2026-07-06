/**
 * W-06: POST /api/v1/voice-profiles/{id}/samples — submit an uploaded sample for
 * ingest/scoring. Mirrors voiceProfile.submitSample. See docs/ios/02-API-CONTRACT.md §6.
 */
import { type NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/server/db/client"
import { enqueueIngestJob } from "@/server/queue/producers"
import { writeAuditLog } from "@/server/services/audit"
import { apiError, apiOk, requireWrite, isAuthError } from "@/server/api/rest"

const schema = z.object({
  storageKey: z.string().min(1),
  notes: z.string().optional(),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWrite(req)
  if (isAuthError(auth)) return auth
  const { id } = await params

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, "VALIDATION", "Invalid JSON body")
  }
  const parsed = schema.safeParse(body)
  if (!parsed.success) return apiError(400, "VALIDATION", parsed.error.issues[0]?.message ?? "Validation error")

  const profile = await db.voiceProfile.findUnique({ where: { id } })
  if (!profile) return apiError(404, "NOT_FOUND", "Profile not found")
  if (profile.ownerId !== auth.user.id) return apiError(403, "FORBIDDEN", "Not allowed")
  // Uploaded object must live under this profile's prefix (matches upload-url).
  if (!parsed.data.storageKey.startsWith(`uploads/${id}/`)) {
    return apiError(400, "VALIDATION", "storageKey does not belong to this profile")
  }

  const latest = await db.voiceSample.findFirst({
    where: { profileId: id },
    orderBy: { version: "desc" },
    select: { version: true },
  })
  const version = (latest?.version ?? 0) + 1

  await enqueueIngestJob({
    profileId: id,
    storageKey: parsed.data.storageKey,
    version,
    userId: auth.user.id,
    notes: parsed.data.notes,
  })
  await writeAuditLog({ actorId: auth.user.id, action: "voiceProfile.submitSample", targetType: "VoiceProfile", targetId: id, meta: { version } })
  return apiOk({ version }, 202)
}
