/**
 * Google reCAPTCHA — configured entirely from Admin → Settings (no env vars).
 * The secret is stored encrypted in the single `security.recaptcha` setting.
 * Enabling is gated on the secret being accepted by Google (see validateSecret).
 */
import { db } from "@/server/db/client"
import { encryptApiKey, decryptApiKey } from "@/server/services/crypto"

const SETTING_KEY = "security.recaptcha"
const SITEVERIFY = "https://www.google.com/recaptcha/api/siteverify"

export type RecaptchaVersion = "v2" | "v3"

export interface RecaptchaPublicConfig {
  enabled: boolean
  siteKey: string
  version: RecaptchaVersion
  minScore: number
}

interface StoredConfig extends RecaptchaPublicConfig {
  secretEnc: string | null
}

interface SiteverifyResp {
  success: boolean
  score?: number
  "error-codes"?: string[]
}

async function readStored(): Promise<StoredConfig> {
  const row = await db.setting.findUnique({ where: { key: SETTING_KEY } })
  const v = (row?.value ?? {}) as Partial<StoredConfig>
  return {
    enabled: Boolean(v.enabled),
    siteKey: typeof v.siteKey === "string" ? v.siteKey : "",
    version: v.version === "v3" ? "v3" : "v2",
    minScore: typeof v.minScore === "number" ? v.minScore : 0.5,
    secretEnc: typeof v.secretEnc === "string" ? v.secretEnc : null,
  }
}

async function siteverify(secret: string, token: string, remoteip?: string): Promise<SiteverifyResp> {
  const body = new URLSearchParams({ secret, response: token })
  if (remoteip) body.set("remoteip", remoteip)
  const resp = await fetch(SITEVERIFY, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  return (await resp.json()) as SiteverifyResp
}

/** Public config for the login page — never exposes the secret. */
export async function getRecaptchaPublicConfig(): Promise<RecaptchaPublicConfig> {
  const s = await readStored()
  return { enabled: s.enabled, siteKey: s.siteKey, version: s.version, minScore: s.minScore }
}

/** Admin view — includes whether a secret is stored, but not the secret itself. */
export async function getRecaptchaAdminView(): Promise<RecaptchaPublicConfig & { hasSecret: boolean }> {
  const s = await readStored()
  return { enabled: s.enabled, siteKey: s.siteKey, version: s.version, minScore: s.minScore, hasSecret: !!s.secretEnc }
}

/**
 * Verify a token from a real login attempt. Returns true when reCAPTCHA is off
 * (nothing to enforce) or when Google accepts the token (v3 also checks score).
 */
export async function verifyRecaptchaToken(token: string, remoteip?: string): Promise<boolean> {
  const cfg = await readStored()
  if (!cfg.enabled) return true
  if (!cfg.secretEnc || !token) return false
  try {
    const secret = await decryptApiKey(cfg.secretEnc)
    const data = await siteverify(secret, token, remoteip)
    if (!data.success) return false
    if (cfg.version === "v3" && typeof data.score === "number") return data.score >= cfg.minScore
    return true
  } catch {
    return false
  }
}

/**
 * Save config. Throws (rejecting the enable) when a secret that Google flags as
 * `invalid-input-secret` is used while enabling — so a bad key can never be
 * turned on. A blank `secretKey` keeps the previously stored secret.
 */
export async function saveRecaptchaConfig(input: {
  enabled: boolean
  siteKey: string
  version: RecaptchaVersion
  minScore?: number | undefined
  secretKey?: string | undefined
}): Promise<void> {
  const current = await readStored()
  let secretEnc = current.secretEnc
  if (input.secretKey) secretEnc = await encryptApiKey(input.secretKey)

  if (input.enabled) {
    // Google's siteverify can't validate a secret without a real solved token
    // (a bad secret and a bad token both return `invalid-input-response`), so we
    // format-check both keys here. A wrong-but-well-formed secret only surfaces
    // at first login — where every attempt then fails until it's corrected.
    const KEY_RE = /^6L[0-9A-Za-z_-]{38}$/
    if (!KEY_RE.test(input.siteKey.trim())) {
      throw new Error("Site key doesn't look like a reCAPTCHA key (expected 6L… , 40 chars).")
    }
    if (!secretEnc) throw new Error("Secret key is required to enable reCAPTCHA.")
    if (!KEY_RE.test(await decryptApiKey(secretEnc))) {
      throw new Error("Secret key doesn't look like a reCAPTCHA key (expected 6L… , 40 chars).")
    }
  }

  const value = {
    enabled: input.enabled,
    siteKey: input.siteKey.trim(),
    version: input.version,
    minScore: input.minScore ?? current.minScore,
    secretEnc,
  }
  await db.setting.upsert({
    where: { key: SETTING_KEY },
    create: { key: SETTING_KEY, value },
    update: { value },
  })
}
