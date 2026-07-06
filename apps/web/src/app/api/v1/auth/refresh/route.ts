/**
 * W-02: POST /api/v1/auth/refresh — rotate the refresh token, issue a new pair.
 * Reuse of a revoked token burns the whole family (theft detection).
 * See docs/ios/01-ACCOUNT-AND-AUTH.md §3.3.
 */
import { type NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/server/db/client"
import { apiError, apiOk, publicUser } from "@/server/api/rest"
import { rotateSession } from "@/server/services/mobile-auth"

const bodySchema = z.object({
  refreshToken: z.string().min(1),
  deviceId: z.string().min(1).max(200),
})

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, "VALIDATION", "Invalid JSON body")
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return apiError(400, "VALIDATION", parsed.error.issues[0]?.message ?? "Validation error")

  const result = await rotateSession(parsed.data.refreshToken, parsed.data.deviceId)
  if ("error" in result) {
    const message =
      result.error === "REFRESH_REUSED"
        ? "Refresh token reuse detected. Please sign in again."
        : "Refresh token is invalid or expired."
    return apiError(401, result.error, message)
  }

  const user = await db.user.findUniqueOrThrow({
    where: { id: result.user.id },
    select: {
      id: true, email: true, name: true, role: true, active: true,
      forcePasswordChange: true, quotaMinutes: true, usedMinutes: true,
    },
  })
  return apiOk({ ...result.tokens, user: publicUser(user) })
}
