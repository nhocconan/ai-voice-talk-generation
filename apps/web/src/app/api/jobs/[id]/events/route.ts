import { type NextRequest } from "next/server"
import { env } from "@/env"
import Redis from "ioredis"
import { db } from "@/server/db/client"
import { resolveSessionOrBearer } from "@/server/api/rest"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Accepts a web session cookie or a mobile Bearer access token — also as
  // `?access_token=` since EventSource cannot set headers (W-10).
  const caller = await resolveSessionOrBearer(req)
  if (!caller) return new Response("Unauthorized", { status: 401 })

  const { id } = await params

  // Authorize: the job must belong to the caller (or admin). Previously any
  // signed-in user could subscribe to any job's event channel.
  const gen = await db.generation.findUnique({ where: { id }, select: { userId: true } })
  if (!gen) return new Response("Not found", { status: 404 })
  const isAdmin = caller.role === "ADMIN" || caller.role === "SUPER_ADMIN"
  if (!isAdmin && gen.userId !== caller.userId) return new Response("Forbidden", { status: 403 })

  const encoder = new TextEncoder()
  const redis = new Redis(env.REDIS_URL)

  const stream = new ReadableStream({
    async start(controller) {
      const channel = `job:${id}:events`

      const onMessage = (_ch: string, message: string) => {
        controller.enqueue(encoder.encode(`data: ${message}\n\n`))
        try {
          const data = JSON.parse(message) as { phase?: string }
          if (data.phase === "DONE" || data.phase === "FAILED") {
            redis.unsubscribe(channel).catch(() => undefined)
            redis.quit().catch(() => undefined)
            controller.close()
          }
        } catch {
          // ignore parse errors
        }
      }

      await redis.subscribe(channel)
      redis.on("message", onMessage)

      // Timeout after 10 minutes
      setTimeout(() => {
        redis.unsubscribe(channel).catch(() => undefined)
        redis.quit().catch(() => undefined)
        controller.close()
      }, 10 * 60 * 1000)
    },
    cancel() {
      redis.quit().catch(() => undefined)
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  })
}
