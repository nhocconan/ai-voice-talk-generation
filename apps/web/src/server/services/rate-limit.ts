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

// --- Login brute-force lockout (account-level, by email) --------------------
// Complements the IP-level rate limit Traefik already applies. Locks an account
// after LOGIN_MAX_FAILURES bad attempts within LOGIN_WINDOW_SECONDS; a correct
// login clears the counter. Fixed window so a locked user reliably unlocks at
// window end rather than having retries extend the lock.
export const LOGIN_MAX_FAILURES = 5
export const LOGIN_WINDOW_SECONDS = 15 * 60

const loginKey = (email: string) => `login:fail:${email.toLowerCase()}`

export async function isLoginLocked(email: string): Promise<boolean> {
  const count = await redis.get(loginKey(email))
  return count != null && Number(count) >= LOGIN_MAX_FAILURES
}

export async function recordLoginFailure(email: string): Promise<void> {
  const key = loginKey(email)
  const count = await redis.incr(key)
  if (count === 1) await redis.expire(key, LOGIN_WINDOW_SECONDS)
}

export async function clearLoginFailures(email: string): Promise<void> {
  await redis.del(loginKey(email))
}
