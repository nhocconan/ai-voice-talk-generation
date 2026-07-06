/**
 * W-06: PUT /api/v1/voice-profiles/{id}/active-version — set the active sample
 * version. Mirrors voiceProfile.setActiveVersion. See docs/ios/02-API-CONTRACT.md §6.
 */
import { type NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/server/db/client"
import { writeAuditLog } from "@/server/services/audit"
import { apiError, apiOk, requireWrite, isAuthError } from "@/server/api/rest"

const schema = z.object({ version: z.number().int().min(1) })

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const sample = await db.voiceSample.findUnique({
    where: { profileId_version: { profileId: id, version: parsed.data.version } },
  })
  if (!sample) return apiError(404, "NOT_FOUND", "Version not found")

  await db.voiceProfile.update({ where: { id }, data: { activeVersion: parsed.data.version } })
  await writeAuditLog({ actorId: auth.user.id, action: "voiceProfile.setActiveVersion", targetType: "VoiceProfile", targetId: id, meta: { version: parsed.data.version } })
  return apiOk({ ok: true, activeVersion: parsed.data.version })
}
