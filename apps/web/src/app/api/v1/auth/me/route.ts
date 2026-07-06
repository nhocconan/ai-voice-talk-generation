/**
 * W-04: GET /api/v1/auth/me — current user + quota, for cold-start hydration.
 * See docs/ios/01-ACCOUNT-AND-AUTH.md §3.3.
 */
import { type NextRequest } from "next/server"
import { apiOk, authenticate, isAuthError, publicUser } from "@/server/api/rest"

export async function GET(req: NextRequest) {
  const auth = await authenticate(req)
  if (isAuthError(auth)) return auth
  return apiOk({ user: publicUser(auth.user) })
}
