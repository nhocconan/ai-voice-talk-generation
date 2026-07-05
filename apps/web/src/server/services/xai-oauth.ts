/**
 * xAI Grok OAuth (SuperGrok / X Premium+) — OAuth 2.0 device-code + PKCE flow.
 *
 * Lets a user authorize the app against their Grok subscription instead of an
 * API key. Tokens are stored (encrypted) in the GROK_OAUTH ProviderConfig.config
 * under `{ oauth: { accessTokenEnc, refreshTokenEnc, expiresAt } }`.
 *
 * Endpoints come from the live OIDC discovery doc; every discovered URL is pinned
 * to https on x.ai / *.x.ai.
 *
 * The client_id is PUBLIC desktop OAuth metadata (PKCE, no secret) — the same
 * public Grok CLI client used by Hermes / OpenClaw / OpenCode. Overridable via
 * env XAI_OAUTH_CLIENT_ID if xAI ever rotates it.
 * Reference: github.com/ysnock404/opencode-grok-auth (same flow).
 */

import crypto from "crypto"
import { Prisma } from "@prisma/client"
import { db } from "@/server/db/client"
import { encryptApiKey, decryptApiKey } from "@/server/services/crypto"

const CLIENT_ID = process.env["XAI_OAUTH_CLIENT_ID"] ?? "b1a00492-073a-47ea-816f-4c329264a828"
const SCOPE = "openid profile email offline_access grok-cli:access api:access"
const REFERRER = "hermes-agent"
const ISSUER = "https://auth.x.ai"

interface OidcConfig {
  device_authorization_endpoint: string
  token_endpoint: string
}

interface TokenResult {
  access_token: string
  refresh_token?: string
  expires_in?: number
}

let oidcCache: OidcConfig | undefined

// Endpoint pinning — refuse anything that is not https on x.ai / *.x.ai.
function assertXaiHttps(url: string): void {
  const u = new URL(url)
  if (u.protocol !== "https:" || !(u.hostname === "x.ai" || u.hostname.endsWith(".x.ai"))) {
    throw new Error(`Refusing non-x.ai OAuth endpoint: ${url}`)
  }
}

export async function discoverOidc(): Promise<OidcConfig> {
  if (oidcCache) return oidcCache
  const resp = await fetch(`${ISSUER}/.well-known/openid-configuration`)
  if (!resp.ok) throw new Error(`OIDC discovery HTTP ${resp.status}`)
  const doc = (await resp.json()) as {
    device_authorization_endpoint?: string
    token_endpoint?: string
  }
  if (!doc.device_authorization_endpoint || !doc.token_endpoint) {
    throw new Error("OIDC discovery missing device/token endpoints")
  }
  assertXaiHttps(doc.device_authorization_endpoint)
  assertXaiHttps(doc.token_endpoint)
  oidcCache = {
    device_authorization_endpoint: doc.device_authorization_endpoint,
    token_endpoint: doc.token_endpoint,
  }
  return oidcCache
}

export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString("base64url")
  const challenge = crypto.createHash("sha256").update(verifier).digest().toString("base64url")
  return { verifier, challenge }
}

export interface DeviceAuth {
  device_code: string
  user_code: string
  verification_uri: string
  verification_uri_complete?: string
  interval?: number
  expires_in?: number
}

export async function startDeviceAuth(codeChallenge: string): Promise<DeviceAuth> {
  const { device_authorization_endpoint } = await discoverOidc()
  const resp = await fetch(device_authorization_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      scope: SCOPE,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      referrer: REFERRER,
    }),
  })
  if (!resp.ok) {
    throw new Error(`Device authorization HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`)
  }
  return (await resp.json()) as DeviceAuth
}

export async function pollToken(
  deviceCode: string,
  codeVerifier: string,
): Promise<TokenResult | { pending: true }> {
  const { token_endpoint } = await discoverOidc()
  const resp = await fetch(token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: deviceCode,
      client_id: CLIENT_ID,
      code_verifier: codeVerifier,
    }),
  })
  const data = (await resp.json().catch(() => ({}))) as TokenResult & { error?: string }
  if (!resp.ok) {
    if (data.error === "authorization_pending" || data.error === "slow_down") return { pending: true }
    throw new Error(`Token exchange failed: ${data.error ?? `HTTP ${resp.status}`}`)
  }
  return data
}

export async function refreshToken(refreshTok: string): Promise<TokenResult> {
  const { token_endpoint } = await discoverOidc()
  const resp = await fetch(token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshTok,
      client_id: CLIENT_ID,
    }),
  })
  if (!resp.ok) throw new Error(`Token refresh HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`)
  return (await resp.json()) as TokenResult
}

interface StoredOAuth {
  accessTokenEnc?: string
  refreshTokenEnc?: string
  expiresAt?: number
}

// Persist encrypted tokens back into ProviderConfig.config.oauth, keeping any
// other config keys (e.g. model) intact. Falls back to the previous refresh
// token when the provider does not rotate one.
export async function storeTokens(
  providerId: string,
  tokens: TokenResult,
  previousRefreshTok?: string,
): Promise<void> {
  const provider = await db.providerConfig.findUniqueOrThrow({ where: { id: providerId } })
  const config =
    provider.config && typeof provider.config === "object" && !Array.isArray(provider.config)
      ? { ...(provider.config as Record<string, unknown>) }
      : {}

  const refreshPlain = tokens.refresh_token ?? previousRefreshTok
  const oauth: StoredOAuth = {
    accessTokenEnc: await encryptApiKey(tokens.access_token),
    ...(refreshPlain ? { refreshTokenEnc: await encryptApiKey(refreshPlain) } : {}),
    expiresAt: Date.now() + (tokens.expires_in ?? 3600) * 1000,
  }
  config["oauth"] = oauth

  await db.providerConfig.update({
    where: { id: providerId },
    data: { config: config as Prisma.InputJsonValue },
  })
}

// Return a valid access token, refreshing (and persisting) if expired.
export async function getAccessToken(
  providerId: string,
  config: Record<string, unknown>,
): Promise<string> {
  const oauth = (config?.["oauth"] ?? {}) as StoredOAuth
  if (!oauth.accessTokenEnc && !oauth.refreshTokenEnc) {
    throw new Error("SuperGrok is not connected. Connect it in Admin → Providers first.")
  }

  // Valid non-expiring-soon access token → use it directly.
  if (oauth.accessTokenEnc && oauth.expiresAt && oauth.expiresAt > Date.now() + 60_000) {
    return decryptApiKey(oauth.accessTokenEnc)
  }

  if (!oauth.refreshTokenEnc) {
    throw new Error("SuperGrok token expired and no refresh token is available. Reconnect it.")
  }
  const refreshTok = await decryptApiKey(oauth.refreshTokenEnc)
  const tokens = await refreshToken(refreshTok)
  await storeTokens(providerId, tokens, refreshTok)
  return tokens.access_token
}

export function isConnected(config: Record<string, unknown> | null | undefined): boolean {
  const oauth = (config?.["oauth"] ?? {}) as StoredOAuth
  return Boolean(oauth.accessTokenEnc ?? oauth.refreshTokenEnc)
}

// Remove stored OAuth tokens from a provider's config (Disconnect).
export async function clearTokens(providerId: string): Promise<void> {
  const provider = await db.providerConfig.findUniqueOrThrow({ where: { id: providerId } })
  const config =
    provider.config && typeof provider.config === "object" && !Array.isArray(provider.config)
      ? { ...(provider.config as Record<string, unknown>) }
      : {}
  delete config["oauth"]
  await db.providerConfig.update({
    where: { id: providerId },
    data: { config: config as Prisma.InputJsonValue },
  })
}

function pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

// Extract a refresh token from a pasted blob: either a raw refresh_token string,
// or a JSON config (e.g. ~/.hermes/auth.json) containing refresh_token / refresh
// / tokens.refresh_token / tokens.refresh.
export function parseRefreshToken(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) throw new Error("Empty token")
  if (trimmed.startsWith("{")) {
    let obj: Record<string, unknown>
    try {
      obj = JSON.parse(trimmed) as Record<string, unknown>
    } catch {
      throw new Error("Invalid JSON token blob")
    }
    const nested = (obj["tokens"] ?? {}) as Record<string, unknown>
    const found =
      pickString(obj["refresh_token"]) ??
      pickString(obj["refresh"]) ??
      pickString(nested["refresh_token"]) ??
      pickString(nested["refresh"])
    if (!found) throw new Error("No refresh_token found in the pasted JSON")
    return found
  }
  return trimmed
}

// Validate a pasted refresh token by performing one refresh, then persist the
// resulting encrypted tokens into the provider config (same shape as the device
// flow). Throws with a clear message when the token is rejected.
export async function importRefreshTokenForProvider(providerId: string, input: string): Promise<void> {
  const refreshTok = parseRefreshToken(input)
  const tokens = await refreshToken(refreshTok)
  await storeTokens(providerId, tokens, refreshTok)
}

// Server-side PKCE verifier stash keyed by device_code. In-memory is fine for
// this single-server app; entries self-expire with the device code.
const pkceStore = new Map<string, { verifier: string; expiresAt: number }>()

export function stashVerifier(deviceCode: string, verifier: string, expiresIn: number): void {
  pkceStore.set(deviceCode, { verifier, expiresAt: Date.now() + expiresIn * 1000 })
}

export function takeVerifier(deviceCode: string): string | undefined {
  const entry = pkceStore.get(deviceCode)
  if (!entry) return undefined
  if (entry.expiresAt < Date.now()) {
    pkceStore.delete(deviceCode)
    return undefined
  }
  return entry.verifier
}

export function clearVerifier(deviceCode: string): void {
  pkceStore.delete(deviceCode)
}
