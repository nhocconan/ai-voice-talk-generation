/**
 * W-04: POST /api/v1/auth/change-password — accepted even when fpc:true.
 * Re-hashes, clears forcePasswordChange, revokes all refresh families.
 * See docs/ios/01-ACCOUNT-AND-AUTH.md §3.3.
 */
import { type NextRequest } from "next/server"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { db } from "@/server/db/client"
import { writeAuditLog } from "@/server/services/audit"
import { apiError, apiOk, authenticate, isAuthError } from "@/server/api/rest"
import { revokeAllForUser } from "@/server/services/mobile-auth"

const bodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
})

export async function POST(req: NextRequest) {
  // Intentionally NOT requireWrite — a forced-password-change user must be able
  // to reach this endpoint while still gated everywhere else.
  const auth = await authenticate(req)
  if (isAuthError(auth)) return auth

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, "VALIDATION", "Invalid JSON body")
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    const weak = parsed.error.issues.some((i) => i.path[0] === "newPassword")
    return apiError(400, weak ? "WEAK_PASSWORD" : "VALIDATION", parsed.error.issues[0]?.message ?? "Validation error")
  }

  const user = await db.user.findUniqueOrThrow({ where: { id: auth.user.id }, select: { passwordHash: true } })
  if (!(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
    return apiError(401, "INVALID_CREDENTIALS", "Current password is incorrect")
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12)
  await db.user.update({
    where: { id: auth.user.id },
    data: { passwordHash, forcePasswordChange: false },
  })
  await revokeAllForUser(auth.user.id)
  await writeAuditLog({ actorId: auth.user.id, action: "auth.changePassword", targetType: "User", targetId: auth.user.id, meta: { channel: "mobile" } })

  return apiOk({ ok: true })
}
