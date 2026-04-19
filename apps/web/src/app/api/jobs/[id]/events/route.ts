import { type NextRequest } from "next/server"
import { auth } from "@/server/auth"
import { env } from "@/env"
import Redis from "ioredis"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) return new Response("Unauthorized", { status: 401 })

  const { id } = await params

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
