/**
 * W-01: POST /api/v1/auth/login — credential → token pair.
 * See docs/ios/01-ACCOUNT-AND-AUTH.md §3.3.
 */
import { type NextRequest } from "next/server"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { db } from "@/server/db/client"
import { writeAuditLog } from "@/server/services/audit"
import { checkFixedWindowLimit } from "@/server/services/rate-limit"
import { apiError, apiOk, publicUser } from "@/server/api/rest"
import { createSession } from "@/server/services/mobile-auth"

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  deviceId: z.string().min(1).max(200),
  deviceName: z.string().max(200).optional(),
})

function clientIp(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const rl = await checkFixedWindowLimit("auth_login", ip, 5, 900)
  if (!rl.allowed) return apiError(429, "RATE_LIMITED", "Too many login attempts. Try again later.", 900)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, "VALIDATION", "Invalid JSON body")
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return apiError(400, "VALIDATION", parsed.error.issues[0]?.message ?? "Validation error")

  const { email, password, deviceId, deviceName } = parsed.data
  const user = await db.user.findUnique({ where: { email } })
  if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
    return apiError(401, "INVALID_CREDENTIALS", "Invalid email or password")
  }

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  await writeAuditLog({ actorId: user.id, action: "auth.login", targetType: "User", targetId: user.id, ip, meta: { channel: "mobile" } })

  const tokens = await createSession(user, { deviceId, deviceName: deviceName ?? null })
  return apiOk({ ...tokens, user: publicUser(user) })
}
