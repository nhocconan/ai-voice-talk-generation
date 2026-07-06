/**
 * W-06: GET /api/v1/voice-profiles (list) · POST /api/v1/voice-profiles (create).
 * Mirrors voiceProfile.list / voiceProfile.create. See docs/ios/02-API-CONTRACT.md §6.
 */
import { type NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/server/db/client"
import { writeAuditLog } from "@/server/services/audit"
import { apiError, apiOk, authenticate, requireWrite, isAuthError } from "@/server/api/rest"

function isAdmin(role: string): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN"
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req)
  if (isAuthError(auth)) return auth
  const { id: userId, role } = auth.user

  const profiles = await db.voiceProfile.findMany({
    where: isAdmin(role) ? {} : { OR: [{ ownerId: userId }, { isOrgShared: true }] },
    include: {
      owner: { select: { name: true, email: true } },
      samples: { select: { version: true, durationMs: true, qualityScore: true, createdAt: true } },
    },
    orderBy: { createdAt: "desc" },
  })
  return apiOk({ profiles })
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
  lang: z.enum(["vi", "en", "multi"]),
  consentText: z.string().min(10),
})

export async function POST(req: NextRequest) {
  const auth = await requireWrite(req)
  if (isAuthError(auth)) return auth

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, "VALIDATION", "Invalid JSON body")
  }
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) return apiError(400, "VALIDATION", parsed.error.issues[0]?.message ?? "Validation error")

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined
  const profile = await db.voiceProfile.create({
    data: {
      ownerId: auth.user.id,
      name: parsed.data.name,
      lang: parsed.data.lang,
      consent: {
        signedAt: new Date().toISOString(),
        text: parsed.data.consentText,
        userId: auth.user.id,
        ip: ip ?? null,
        userAgent: req.headers.get("user-agent") ?? null,
        channel: "mobile",
      },
    },
  })
  await writeAuditLog({ actorId: auth.user.id, action: "voiceProfile.create", targetType: "VoiceProfile", targetId: profile.id, ip })
  return apiOk({ profile }, 201)
}
