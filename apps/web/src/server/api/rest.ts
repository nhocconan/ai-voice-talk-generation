/**
 * Shared helpers for the versioned mobile REST facade (`/api/v1/*`, iOS EPIC W).
 * Standard error envelope + Bearer access-token authentication. See
 * docs/ios/02-API-CONTRACT.md §3 and docs/ios/01-ACCOUNT-AND-AUTH.md §3.
 */
import { type NextRequest, NextResponse } from "next/server"
import { createHash } from "crypto"
import { TRPCError } from "@trpc/server"
import { db } from "@/server/db/client"
import { auth as webAuth } from "@/server/auth"
import { verifyAccessDetailed } from "@/server/services/mobile-auth"

export interface ApiUser {
  id: string
  email: string
  name: string
  role: string
  active: boolean
  forcePasswordChange: boolean
  quotaMinutes: number
  usedMinutes: number
}

const API_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  active: true,
  forcePasswordChange: true,
  quotaMinutes: true,
  usedMinutes: true,
} as const

/** The `user` object shape returned by /auth/login, /auth/refresh, /auth/me. */
export function publicUser(u: ApiUser) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    forcePasswordChange: u.forcePasswordChange,
    quotaMinutes: u.quotaMinutes,
    usedMinutes: u.usedMinutes,
  }
}

export function apiError(
  status: number,
  code: string,
  message: string,
  retryAfter?: number,
): NextResponse {
  return NextResponse.json(
    { error: { code, message, ...(retryAfter ? { retryAfter } : {}) } },
    { status, ...(retryAfter ? { headers: { "Retry-After": String(retryAfter) } } : {}) },
  )
}

export function apiOk(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status })
}

export interface AuthResult {
  user: ApiUser
  fpc: boolean
}

/**
 * Resolve the caller from a `Bearer <access token>` header. Returns the user or
 * a ready-to-return error response. Does NOT enforce the forcePasswordChange
 * gate — use `requireWrite` for mutating endpoints.
 */
export async function authenticate(req: NextRequest): Promise<AuthResult | NextResponse> {
  const header = req.headers.get("authorization")
  if (!header?.startsWith("Bearer ")) {
    return apiError(401, "UNAUTHORIZED", "Missing or malformed Authorization header")
  }
  const token = header.slice(7)
  const res = verifyAccessDetailed(token)
  if (!res.ok) {
    return apiError(401, res.reason, res.reason === "TOKEN_EXPIRED" ? "Access token expired" : "Invalid access token")
  }
  const user = await db.user.findUnique({ where: { id: res.claims.sub }, select: API_USER_SELECT })
  if (!user || !user.active) return apiError(401, "TOKEN_INVALID", "User not found or inactive")
  return { user, fpc: res.claims.fpc }
}

/** True when the auth call returned an error response rather than a user. */
export function isAuthError(r: AuthResult | NextResponse): r is NextResponse {
  return r instanceof NextResponse
}

/**
 * Like `authenticate`, but rejects tokens carrying `fpc:true` (or users still
 * flagged forcePasswordChange) with 403 — for enrollment/generation writes.
 */
export async function requireWrite(req: NextRequest): Promise<AuthResult | NextResponse> {
  const r = await authenticate(req)
  if (isAuthError(r)) return r
  if (r.fpc || r.user.forcePasswordChange) {
    return apiError(403, "PASSWORD_CHANGE_REQUIRED", "Password change required before this action")
  }
  return r
}

/**
 * Resolve a caller from EITHER a NextAuth web session cookie OR a mobile Bearer
 * access token (also accepted as `?access_token=` for EventSource/SSE, which
 * cannot set headers). Returns `{ userId, role }` or null. Used by the shared
 * SSE / download / export routes that both web and mobile hit. (W-10)
 */
export async function resolveSessionOrBearer(
  req: NextRequest,
): Promise<{ userId: string; role: string } | null> {
  const session = await webAuth()
  if (session?.user) return { userId: session.user.id, role: (session.user.role as string) ?? "USER" }

  const header = req.headers.get("authorization")
  const token = header?.startsWith("Bearer ") ? header.slice(7) : req.nextUrl.searchParams.get("access_token")
  if (!token) return null
  const res = verifyAccessDetailed(token)
  if (!res.ok) return null
  const user = await db.user.findUnique({ where: { id: res.claims.sub }, select: { id: true, role: true, active: true } })
  if (!user || !user.active) return null
  return { userId: user.id, role: user.role }
}

const TRPC_STATUS: Record<string, number> = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PRECONDITION_FAILED: 412,
  PAYLOAD_TOO_LARGE: 413,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
}

/**
 * Map a thrown TRPCError (from the shared generation/voiceProfile helpers) onto
 * the REST envelope, so the facade reuses the exact tRPC validation without
 * duplicating it. A few codes are renamed to the stable app-facing codes.
 */
export function mapTrpcError(e: unknown): NextResponse {
  if (e instanceof TRPCError) {
    const status = TRPC_STATUS[e.code] ?? 500
    const code =
      e.code === "TOO_MANY_REQUESTS"
        ? "RATE_LIMITED"
        : e.code === "FORBIDDEN" && /quota/i.test(e.message)
          ? "QUOTA_EXCEEDED"
          : e.code
    return apiError(status, code, e.message)
  }
  return apiError(500, "INTERNAL", "Unexpected error")
}

/**
 * Write-endpoint auth for generation routes: accepts a mobile Bearer access
 * token (fpc-gated) OR a legacy `Bearer vk_` API key. Returns the user or an
 * error response.
 */
export async function resolveWriteCaller(req: NextRequest): Promise<ApiUser | NextResponse> {
  const header = req.headers.get("authorization") ?? ""
  if (header.startsWith("Bearer vk_")) {
    const u = await resolveLegacyApiKey(req)
    return u ?? apiError(401, "UNAUTHORIZED", "Invalid API key")
  }
  const r = await requireWrite(req)
  if (isAuthError(r)) return r
  return r.user
}

/**
 * Legacy `Bearer vk_...` API-key resolver (pre-existing REST auth). Returns the
 * owning user or null. Used by /generate to keep supporting minted API keys
 * alongside mobile access tokens.
 */
export async function resolveLegacyApiKey(req: NextRequest): Promise<ApiUser | null> {
  const header = req.headers.get("authorization")
  if (!header?.startsWith("Bearer vk_")) return null
  const raw = header.slice(7)
  const keyHash = createHash("sha256").update(raw).digest("hex")
  const record = await db.apiKey.findUnique({
    where: { keyHash },
    include: { user: { select: API_USER_SELECT } },
  })
  if (!record) return null
  if (record.expiresAt && record.expiresAt < new Date()) return null
  if (!record.user.active) return null
  db.apiKey.update({ where: { id: record.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined)
  return record.user
}
