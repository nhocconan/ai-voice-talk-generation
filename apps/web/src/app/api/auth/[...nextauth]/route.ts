import type { NextRequest } from "next/server"
import { handlers } from "@/server/auth"
import { checkFixedWindowLimit } from "@/server/services/rate-limit"

export const GET = handlers.GET

// Strip Max-Age/Expires from the session-token cookie(s) so it becomes a
// browser-session cookie that clears on close (used when "remember me" is off).
// Matches both `authjs.session-token` and the prod `__Secure-` prefixed name,
// including chunked `.0`/`.1` variants.
function toSessionCookies(res: Response): Response {
  const setCookies = res.headers.getSetCookie()
  if (setCookies.length === 0) return res
  const headers = new Headers(res.headers)
  headers.delete("set-cookie")
  for (const cookie of setCookies) {
    headers.append(
      "set-cookie",
      cookie.includes("authjs.session-token")
        ? cookie.replace(/;\s*Max-Age=\d+/gi, "").replace(/;\s*Expires=[^;]+/gi, "")
        : cookie,
    )
  }
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

export async function POST(request: NextRequest) {
  if (process.env["E2E_TEST"] === "1") {
    return handlers.POST(request)
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  const limit = await checkFixedWindowLimit("auth", ip, 5, 15 * 60)

  if (!limit.allowed) {
    return new Response("Too many authentication attempts", {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(limit.resetAt - Math.floor(Date.now() / 1000), 1)),
      },
    })
  }

  // "Remember me": only downgrade to a session cookie when the login form
  // explicitly opts out (rememberMe=false). Absent field → keep the persistent
  // 30-day cookie (back-compat for the mobile API and older clients).
  const isCredentialsLogin = request.nextUrl.pathname.endsWith("/callback/credentials")
  let optedOut = false
  if (isCredentialsLogin) {
    const form = await request.clone().formData().catch(() => null)
    optedOut = form?.get("rememberMe") === "false"
  }

  const res = await handlers.POST(request)
  return isCredentialsLogin && optedOut ? toSessionCookies(res) : res
}
