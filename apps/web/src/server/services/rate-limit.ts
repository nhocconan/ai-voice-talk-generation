import Redis from "ioredis"
import { env } from "@/env"

// lazyConnect so importing this module (incl. at next build "collect page data"
// time) does not open a TCP connection — it connects on first command instead.
const redis = new Redis(env.REDIS_URL, { lazyConnect: true })

export interface FixedWindowLimitResult {
  allowed: boolean
  remaining: number
  resetAt: number
}

export async function checkFixedWindowLimit(
  scope: string,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<FixedWindowLimitResult> {
  const nowSeconds = Math.floor(Date.now() / 1000)
  const windowStart = nowSeconds - (nowSeconds % windowSeconds)
  const redisKey = `ratelimit:${scope}:${key}:${windowStart}`

  const count = await redis.incr(redisKey)
  if (count === 1) {
    await redis.expire(redisKey, windowSeconds)
  }

  return {
    allowed: count <= limit,
    remaining: Math.max(limit - count, 0),
    resetAt: windowStart + windowSeconds,
  }
}
