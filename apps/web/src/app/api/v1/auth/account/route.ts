/**
 * W-13: DELETE /api/v1/auth/account — in-app account deletion (Apple 5.1.1(v)).
 *
 * Deactivates the account immediately (blocks all further access), revokes every
 * mobile refresh token, and deletes the user's API keys, then records a deletion
 * request. Hard purge of profiles/samples/generations/storage is performed by an
 * operator/cron within the documented SLA (deferred here to avoid destructive
 * cascades that can't be transactionally verified without a live DB); the account
 * is already unusable from this point. See docs/ios/05 P0 and 02-API-CONTRACT.md.
 */
import { type NextRequest } from "next/server"
import { db } from "@/server/db/client"
import { writeAuditLog } from "@/server/services/audit"
import { apiOk, authenticate, isAuthError } from "@/server/api/rest"
import { revokeAllForUser } from "@/server/services/mobile-auth"

const PURGE_SLA_DAYS = 30

export async function DELETE(req: NextRequest) {
  const auth = await authenticate(req)
  if (isAuthError(auth)) return auth
  const userId = auth.user.id

  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { active: false } }),
    db.apiKey.deleteMany({ where: { userId } }),
  ])
  await revokeAllForUser(userId)

  await writeAuditLog({
    actorId: userId,
    action: "auth.accountDeletionRequested",
    targetType: "User",
    targetId: userId,
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
    meta: { channel: "mobile", purgeSlaDays: PURGE_SLA_DAYS },
  })

  return apiOk({ status: "deletion_requested", deactivated: true, purgeSlaDays: PURGE_SLA_DAYS })
}
