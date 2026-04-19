import type { NextRequest } from "next/server"
import { handlers } from "@/server/auth"
import { checkFixedWindowLimit } from "@/server/services/rate-limit"

export const GET = handlers.GET

export async function POST(request: NextRequest) {
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

  return handlers.POST(request)
}
