/**
 * W-06: GET /api/v1/voice-profiles/{id}/samples/{version}/download-url — presigned
 * GET for a sample. Mirrors voiceProfile.getSampleDownloadUrl. See docs/ios/02-API-CONTRACT.md §6.
 */
import { type NextRequest } from "next/server"
import { db } from "@/server/db/client"
import { generatePresignedGetUrl } from "@/server/services/storage"
import { apiError, apiOk, authenticate, isAuthError } from "@/server/api/rest"

function isAdmin(role: string): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN"
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; version: string }> }) {
  const auth = await authenticate(req)
  if (isAuthError(auth)) return auth
  const { id, version } = await params
  const versionNum = Number(version)
  if (!Number.isInteger(versionNum) || versionNum < 1) return apiError(400, "VALIDATION", "Invalid version")

  const profile = await db.voiceProfile.findUnique({ where: { id } })
  if (!profile) return apiError(404, "NOT_FOUND", "Profile not found")
  if (!isAdmin(auth.user.role) && profile.ownerId !== auth.user.id && !profile.isOrgShared) {
    return apiError(403, "FORBIDDEN", "Not allowed")
  }

  const sample = await db.voiceSample.findUnique({
    where: { profileId_version: { profileId: id, version: versionNum } },
  })
  if (!sample) return apiError(404, "NOT_FOUND", "Version not found")

  const url = await generatePresignedGetUrl(sample.storageKey, 300)
  return apiOk({ url })
}
