/**
 * W-14: APNs push for job completion. Credential-gated — if the APNS_* env vars
 * are not set it no-ops (logs and returns), so dev/self-host works without push.
 *
 * Required env for live delivery:
 *   APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID (the app's bundle id = apns-topic),
 *   APNS_PRIVATE_KEY (contents of the .p8 auth key, PEM),
 *   APNS_HOST (default api.sandbox.push.apple.com; use api.push.apple.com in prod).
 *
 * Uses the built-in http2 client because APNs requires HTTP/2.
 */
import crypto from "crypto"
import http2 from "http2"
import { db } from "@/server/db/client"

interface ApnsConfig {
  keyId: string
  teamId: string
  bundleId: string
  privateKey: string
  host: string
}

function apnsConfig(): ApnsConfig | null {
  const keyId = process.env["APNS_KEY_ID"]
  const teamId = process.env["APNS_TEAM_ID"]
  const bundleId = process.env["APNS_BUNDLE_ID"]
  const privateKey = process.env["APNS_PRIVATE_KEY"]
  if (!keyId || !teamId || !bundleId || !privateKey) return null
  return { keyId, teamId, bundleId, privateKey: privateKey.replace(/\\n/g, "\n"), host: process.env["APNS_HOST"] ?? "api.sandbox.push.apple.com" }
}

let cachedJwt: { token: string; issuedAt: number } | undefined

// APNs provider JWT (ES256), reusable for up to ~1h.
function providerJwt(cfg: ApnsConfig): string {
  if (cachedJwt && Date.now() - cachedJwt.issuedAt < 45 * 60 * 1000) return cachedJwt.token
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: cfg.keyId })).toString("base64url")
  const payload = Buffer.from(JSON.stringify({ iss: cfg.teamId, iat: Math.floor(Date.now() / 1000) })).toString("base64url")
  const signingInput = `${header}.${payload}`
  const sig = crypto
    .sign("sha256", Buffer.from(signingInput), { key: cfg.privateKey, dsaEncoding: "ieee-p1363" })
    .toString("base64url")
  const token = `${signingInput}.${sig}`
  cachedJwt = { token, issuedAt: Date.now() }
  return token
}

function postToApns(cfg: ApnsConfig, jwt: string, deviceToken: string, body: object): Promise<{ status: number; reason?: string | undefined }> {
  return new Promise((resolve) => {
    const client = http2.connect(`https://${cfg.host}`)
    client.on("error", () => resolve({ status: 0, reason: "connect_error" }))
    const payload = Buffer.from(JSON.stringify(body))
    const reqStream = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": cfg.bundleId,
      "apns-push-type": "alert",
      "content-type": "application/json",
      "content-length": payload.length,
    })
    let status = 0
    let data = ""
    reqStream.on("response", (headers) => { status = headers[":status"] ?? 0 })
    reqStream.setEncoding("utf8")
    reqStream.on("data", (chunk) => { data += String(chunk) })
    reqStream.on("end", () => {
      client.close()
      let reason: string | undefined
      try { reason = (JSON.parse(data || "{}") as { reason?: string }).reason } catch { /* ignore */ }
      resolve({ status, reason })
    })
    reqStream.on("error", () => { client.close(); resolve({ status: 0, reason: "stream_error" }) })
    reqStream.end(payload)
  })
}

/**
 * Send a job-completion push to all of a user's registered devices. Best-effort:
 * never throws. Prunes device tokens APNs reports as gone (410 / BadDeviceToken).
 */
export async function sendJobCompletionPush(
  userId: string,
  job: { generationId: string; kind: string; status: "DONE" | "FAILED" },
): Promise<void> {
  const cfg = apnsConfig()
  const devices = await db.device.findMany({ where: { userId }, select: { apnsToken: true } })
  if (devices.length === 0) return
  if (!cfg) {
    console.info(`[push] APNs not configured — skipping ${devices.length} device(s) for job ${job.generationId}`)
    return
  }

  const done = job.status === "DONE"
  const body = {
    aps: {
      alert: {
        title: done ? "Your audio is ready" : "Generation failed",
        body: done ? "Tap to listen and download." : "Something went wrong. Tap for details.",
      },
      sound: "default",
    },
    generationId: job.generationId,
    kind: job.kind,
    status: job.status,
  }

  const jwt = providerJwt(cfg)
  await Promise.all(
    devices.map(async (d) => {
      const res = await postToApns(cfg, jwt, d.apnsToken, body)
      if (res.status === 410 || res.reason === "BadDeviceToken" || res.reason === "Unregistered") {
        await db.device.deleteMany({ where: { apnsToken: d.apnsToken } }).catch(() => undefined)
      } else if (res.status !== 200) {
        console.warn(`[push] APNs ${res.status} ${res.reason ?? ""} for job ${job.generationId}`)
      }
    }),
  )
}
