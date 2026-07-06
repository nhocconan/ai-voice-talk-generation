/**
 * Mobile auth (iOS EPIC W) — short-lived HS256 access JWTs + rotating opaque
 * refresh tokens with family reuse-detection. See docs/ios/01-ACCOUNT-AND-AUTH.md §3.
 *
 * Access tokens are stateless (verified by signature only). Refresh tokens are
 * opaque `mr_<base64url>` strings; only their sha256 hash is persisted. Rotation
 * is single-use: presenting a token revokes it and issues a successor in the same
 * family. Presenting an already-revoked token revokes the whole family (theft).
 */
import crypto from "crypto"
import { env } from "@/env"
import { db } from "@/server/db/client"

const ACCESS_TTL_S = 15 * 60 // 15 minutes
const REFRESH_TTL_S = 30 * 24 * 60 * 60 // 30 days
const REFRESH_PREFIX = "mr_"
const SIGNING_KEY = crypto.createHash("sha256").update(env.AUTH_SECRET).digest()

export const accessTtlSeconds = ACCESS_TTL_S
export const refreshTtlSeconds = REFRESH_TTL_S

// --- HS256 JWT (dependency-free) --------------------------------------------

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url")
}

export interface AccessClaims {
  sub: string
  role: string
  fpc: boolean
  typ: "access"
  iat: number
  exp: number
  jti: string
}

export function mintAccessToken(user: { id: string; role: string; forcePasswordChange: boolean }): {
  token: string
  expiresIn: number
} {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: "HS256", typ: "JWT" }
  const payload: AccessClaims = {
    sub: user.id,
    role: user.role,
    fpc: user.forcePasswordChange,
    typ: "access",
    iat: now,
    exp: now + ACCESS_TTL_S,
    jti: crypto.randomUUID(),
  }
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
  const sig = crypto.createHmac("sha256", SIGNING_KEY).update(signingInput).digest("base64url")
  return { token: `${signingInput}.${sig}`, expiresIn: ACCESS_TTL_S }
}

export type AccessVerifyResult =
  | { ok: true; claims: AccessClaims }
  | { ok: false; reason: "TOKEN_INVALID" | "TOKEN_EXPIRED" }

/** Verify signature and expiry, distinguishing expired from malformed/forged. */
export function verifyAccessDetailed(token: string): AccessVerifyResult {
  const parts = token.split(".")
  if (parts.length !== 3) return { ok: false, reason: "TOKEN_INVALID" }
  const [headerB64, payloadB64, sig] = parts
  const expected = crypto
    .createHmac("sha256", SIGNING_KEY)
    .update(`${headerB64}.${payloadB64}`)
    .digest("base64url")
  const sigBuf = Buffer.from(sig ?? "", "utf8")
  const expBuf = Buffer.from(expected, "utf8")
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { ok: false, reason: "TOKEN_INVALID" }
  }
  let claims: AccessClaims
  try {
    claims = JSON.parse(Buffer.from(payloadB64 ?? "", "base64url").toString("utf8")) as AccessClaims
  } catch {
    return { ok: false, reason: "TOKEN_INVALID" }
  }
  if (claims.typ !== "access" || typeof claims.exp !== "number") return { ok: false, reason: "TOKEN_INVALID" }
  if (claims.exp < Math.floor(Date.now() / 1000)) return { ok: false, reason: "TOKEN_EXPIRED" }
  return { ok: true, claims }
}

/** Returns claims if the token is a valid, unexpired access JWT; else null. */
export function verifyAccessToken(token: string): AccessClaims | null {
  const res = verifyAccessDetailed(token)
  return res.ok ? res.claims : null
}

// --- Refresh tokens ----------------------------------------------------------

function hashRefresh(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex")
}

function newRefreshSecret(): string {
  return REFRESH_PREFIX + crypto.randomBytes(32).toString("base64url")
}

export interface IssuedTokens {
  accessToken: string
  accessExpiresIn: number
  refreshToken: string
  refreshExpiresIn: number
}

async function issueAccessAndRefresh(
  user: { id: string; role: string; forcePasswordChange: boolean },
  opts: { deviceId: string; deviceName?: string | null; familyId: string; replacesId?: string },
): Promise<IssuedTokens> {
  const access = mintAccessToken(user)
  const refreshSecret = newRefreshSecret()
  const row = await db.mobileRefreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefresh(refreshSecret),
      deviceId: opts.deviceId,
      deviceName: opts.deviceName ?? null,
      familyId: opts.familyId,
      expiresAt: new Date(Date.now() + REFRESH_TTL_S * 1000),
    },
  })
  if (opts.replacesId) {
    await db.mobileRefreshToken.update({
      where: { id: opts.replacesId },
      data: { revokedAt: new Date(), replacedById: row.id },
    })
  }
  return {
    accessToken: access.token,
    accessExpiresIn: access.expiresIn,
    refreshToken: refreshSecret,
    refreshExpiresIn: REFRESH_TTL_S,
  }
}

/** Start a brand-new token family (login). */
export function createSession(
  user: { id: string; role: string; forcePasswordChange: boolean },
  device: { deviceId: string; deviceName?: string | null },
): Promise<IssuedTokens> {
  return issueAccessAndRefresh(user, {
    deviceId: device.deviceId,
    deviceName: device.deviceName ?? null,
    familyId: crypto.randomUUID(),
  })
}

export type RefreshError = "REFRESH_INVALID" | "REFRESH_REUSED"

/**
 * Rotate a refresh token. Returns a fresh pair, or a typed error:
 * - REFRESH_INVALID: unknown / expired / user inactive
 * - REFRESH_REUSED: an already-revoked token was replayed → family revoked
 */
export async function rotateSession(
  presentedToken: string,
  deviceId: string,
): Promise<{ tokens: IssuedTokens; user: { id: string; role: string; forcePasswordChange: boolean } } | { error: RefreshError }> {
  const row = await db.mobileRefreshToken.findUnique({
    where: { tokenHash: hashRefresh(presentedToken) },
    include: { user: { select: { id: true, role: true, forcePasswordChange: true, active: true } } },
  })
  if (!row) return { error: "REFRESH_INVALID" }

  if (row.revokedAt) {
    // Replay of a rotated/revoked token → theft. Burn the whole family.
    await db.mobileRefreshToken.updateMany({
      where: { familyId: row.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    return { error: "REFRESH_REUSED" }
  }
  if (row.expiresAt < new Date() || !row.user.active) return { error: "REFRESH_INVALID" }

  const user = { id: row.user.id, role: row.user.role, forcePasswordChange: row.user.forcePasswordChange }
  const tokens = await issueAccessAndRefresh(user, {
    deviceId,
    deviceName: row.deviceName,
    familyId: row.familyId,
    replacesId: row.id,
  })
  await db.mobileRefreshToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined)
  return { tokens, user }
}

/** Revoke a single presented refresh token (logout). Idempotent. */
export async function revokeRefreshToken(presentedToken: string): Promise<void> {
  await db.mobileRefreshToken.updateMany({
    where: { tokenHash: hashRefresh(presentedToken), revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

/** Revoke every active refresh family for a user (e.g. after password change). */
export async function revokeAllForUser(userId: string): Promise<void> {
  await db.mobileRefreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}
