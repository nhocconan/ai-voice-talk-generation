/**
 * W-15: GET /api/v1/voice-profiles/{id}/samples/{version}/ingest-status.
 * Explicit success/failure/pending for an enrollment so the app never waits
 * forever on a failed ingest. DONE once the sample row exists; otherwise the
 * worker's Redis marker (RUNNING/FAILED) is returned. See docs/ios/03 §4-5.
 */
import { type NextRequest } from "next/server"
import Redis from "ioredis"
import { env } from "@/env"
import { db } from "@/server/db/client"
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

  const profile = await db.voiceProfile.findUnique({ where: { id }, select: { ownerId: true, isOrgShared: true } })
  if (!profile) return apiError(404, "NOT_FOUND", "Profile not found")
  if (!isAdmin(auth.user.role) && profile.ownerId !== auth.user.id && !profile.isOrgShared) {
    return apiError(403, "FORBIDDEN", "Not allowed")
  }

  // A persisted sample row is the authoritative success signal.
  const sample = await db.voiceSample.findUnique({
    where: { profileId_version: { profileId: id, version: versionNum } },
    select: { qualityScore: true, qualityDetail: true, durationMs: true },
  })
  if (sample) {
    return apiOk({ status: "DONE", qualityScore: sample.qualityScore, qualityDetail: sample.qualityDetail, durationMs: sample.durationMs })
  }

  // Otherwise consult the worker's transient marker (RUNNING / FAILED).
  const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true })
  try {
    await redis.connect()
    const raw = await redis.get(`ingest:${id}:${versionNum}`)
    if (raw) {
      const parsed = JSON.parse(raw) as { status?: string; message?: string }
      return apiOk({ status: parsed.status ?? "PENDING", message: parsed.message ?? null })
    }
    return apiOk({ status: "PENDING", message: null })
  } catch {
    return apiOk({ status: "PENDING", message: null })
  } finally {
    redis.disconnect()
  }
}
