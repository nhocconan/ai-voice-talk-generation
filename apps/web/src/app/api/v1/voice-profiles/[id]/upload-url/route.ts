/**
 * W-06: POST /api/v1/voice-profiles/{id}/upload-url — presigned PUT for a sample.
 * Mirrors voiceProfile.requestUploadUrl. See docs/ios/02-API-CONTRACT.md §6.
 */
import { type NextRequest } from "next/server"
import crypto from "crypto"
import { z } from "zod"
import { db } from "@/server/db/client"
import { generatePresignedPutUrl } from "@/server/services/storage"
import { apiError, apiOk, requireWrite, isAuthError } from "@/server/api/rest"
import { ALLOWED_AUDIO_MIMES, MAX_UPLOAD_BYTES } from "@/server/routers/voiceProfile"

const schema = z.object({
  filename: z.string().min(1),
  contentType: z.string().min(1),
  contentLength: z.number().max(MAX_UPLOAD_BYTES),
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
  if (!ALLOWED_AUDIO_MIMES.includes(parsed.data.contentType)) {
    return apiError(400, "VALIDATION", "Unsupported file type")
  }

  const profile = await db.voiceProfile.findUnique({ where: { id } })
  if (!profile) return apiError(404, "NOT_FOUND", "Profile not found")
  if (profile.ownerId !== auth.user.id) return apiError(403, "FORBIDDEN", "Not allowed")

  const ext = parsed.data.filename.split(".").pop() ?? "audio"
  const key = `uploads/${id}/${crypto.randomUUID()}.${ext}`
  const uploadUrl = await generatePresignedPutUrl(key, parsed.data.contentType, 3600)
  return apiOk({ uploadUrl, storageKey: key })
}
