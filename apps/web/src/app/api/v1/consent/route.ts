/**
 * W-12: GET /api/v1/consent — voice-cloning consent (AUP) text to display before
 * enrollment. Pass `?lang=vi|en` for a single string, else both are returned.
 * See docs/ios/03-VOICE-PROFILE-AND-CLONING.md §3.
 */
import { type NextRequest } from "next/server"
import { apiOk, authenticate, isAuthError } from "@/server/api/rest"
import { consentPayload } from "@/server/services/consent"

export async function GET(req: NextRequest) {
  const auth = await authenticate(req)
  if (isAuthError(auth)) return auth
  return apiOk(consentPayload(req.nextUrl.searchParams.get("lang") ?? undefined))
}
