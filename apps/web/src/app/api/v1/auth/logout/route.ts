/**
 * W-04: POST /api/v1/auth/logout — revoke the presented refresh token. Idempotent.
 * See docs/ios/01-ACCOUNT-AND-AUTH.md §3.3.
 */
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { apiError, authenticate, isAuthError } from "@/server/api/rest"
import { revokeRefreshToken } from "@/server/services/mobile-auth"

const bodySchema = z.object({ refreshToken: z.string().min(1) })

export async function POST(req: NextRequest) {
  const auth = await authenticate(req)
  if (isAuthError(auth)) return auth

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return apiError(400, "VALIDATION", "Invalid JSON body")
  }
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) return apiError(400, "VALIDATION", "refreshToken required")

  await revokeRefreshToken(parsed.data.refreshToken)
  return new NextResponse(null, { status: 204 })
}
