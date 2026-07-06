/**
 * W-14: register / unregister an APNs device token for the current user.
 * POST { apnsToken, platform?, appVersion? } · DELETE { apnsToken }.
 * See docs/ios/02-API-CONTRACT.md.
 */
import { type NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/server/db/client"
import { apiError, apiOk, authenticate, isAuthError } from "@/server/api/rest"

const registerSchema = z.object({
  apnsToken: z.string().min(1).max(400),
  platform: z.string().max(20).optional(),
  appVersion: z.string().max(40).optional(),
})

export async function POST(req: NextRequest) {
  const auth = await authenticate(req)
  if (isAuthError(auth)) return auth

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return apiError(400, "VALIDATION", "Invalid JSON body")
  }
  const parsed = registerSchema.safeParse(raw)
  if (!parsed.success) return apiError(400, "VALIDATION", parsed.error.issues[0]?.message ?? "Validation error")

  // A token is globally unique; re-registering rebinds it to the current user.
  await db.device.upsert({
    where: { apnsToken: parsed.data.apnsToken },
    create: {
      userId: auth.user.id,
      apnsToken: parsed.data.apnsToken,
      platform: parsed.data.platform ?? "ios",
      appVersion: parsed.data.appVersion ?? null,
    },
    update: { userId: auth.user.id, appVersion: parsed.data.appVersion ?? null, lastSeenAt: new Date() },
  })
  return apiOk({ ok: true }, 201)
}

const deleteSchema = z.object({ apnsToken: z.string().min(1) })

export async function DELETE(req: NextRequest) {
  const auth = await authenticate(req)
  if (isAuthError(auth)) return auth

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return apiError(400, "VALIDATION", "Invalid JSON body")
  }
  const parsed = deleteSchema.safeParse(raw)
  if (!parsed.success) return apiError(400, "VALIDATION", "apnsToken required")

  await db.device.deleteMany({ where: { apnsToken: parsed.data.apnsToken, userId: auth.user.id } })
  return apiOk({ ok: true })
}
