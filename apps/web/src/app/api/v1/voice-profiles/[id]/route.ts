/**
 * W-06: GET /api/v1/voice-profiles/{id} · DELETE /api/v1/voice-profiles/{id}.
 * Mirrors voiceProfile.get / voiceProfile.delete. See docs/ios/02-API-CONTRACT.md §6.
 */
import { type NextRequest } from "next/server"
import { db } from "@/server/db/client"
import { writeAuditLog } from "@/server/services/audit"
import { apiError, apiOk, authenticate, requireWrite, isAuthError } from "@/server/api/rest"

function isAdmin(role: string): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN"
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req)
  if (isAuthError(auth)) return auth
  const { id } = await params

  const profile = await db.voiceProfile.findUnique({
    where: { id },
    include: { samples: true, owner: { select: { name: true } } },
  })
  if (!profile) return apiError(404, "NOT_FOUND", "Profile not found")
  if (!isAdmin(auth.user.role) && profile.ownerId !== auth.user.id && !profile.isOrgShared) {
    return apiError(403, "FORBIDDEN", "Not allowed to view this profile")
  }
  return apiOk({ profile })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWrite(req)
  if (isAuthError(auth)) return auth
  const { id } = await params

  const profile = await db.voiceProfile.findUnique({ where: { id } })
  if (!profile) return apiError(404, "NOT_FOUND", "Profile not found")
  const admin = isAdmin(auth.user.role)
  if (profile.ownerId !== auth.user.id && !admin) return apiError(403, "FORBIDDEN", "Not allowed")
  if (profile.isLocked && !admin) return apiError(403, "FORBIDDEN", "Profile is locked — contact admin to delete")

  await db.voiceProfile.delete({ where: { id } })
  await writeAuditLog({ actorId: auth.user.id, action: "voiceProfile.delete", targetType: "VoiceProfile", targetId: id })
  return apiOk({ ok: true })
}
