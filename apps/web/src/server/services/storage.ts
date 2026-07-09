import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3"
import crypto from "crypto"
import { env } from "@/env"

const s3 = new S3Client({
  endpoint: `${env.MINIO_USE_SSL ? "https" : "http"}://${env.MINIO_ENDPOINT}:${env.MINIO_PORT}`,
  region: "us-east-1",
  credentials: {
    accessKeyId: env.MINIO_ACCESS_KEY,
    secretAccessKey: env.MINIO_SECRET_KEY,
  },
  forcePathStyle: true,
})

// ---------------------------------------------------------------------------
// App-proxied object access.
//
// MinIO stays internal-only (no public route / no DNS). Instead of handing the
// browser/mobile a presigned URL to `vc-minio` (unreachable off-host), we hand
// them a URL to our own `/api/storage` proxy carrying an HMAC-signed token that
// authorizes exactly one key + operation until it expires. The proxy verifies
// the token and streams to/from MinIO. Same security shape as a presigned URL
// (signed, scoped, time-limited), but reachable through Traefik.
// ---------------------------------------------------------------------------

export type StorageOp = "get" | "put"

interface TokenPayload {
  k: string // object key
  o: StorageOp
  e: number // expiry, epoch seconds
  ct?: string // content type (put only)
}

const b64url = (buf: Buffer) => buf.toString("base64url")

function sign(data: string): string {
  return crypto.createHmac("sha256", env.SERVER_SECRET).update(data).digest("base64url")
}

function makeToken(payload: TokenPayload): string {
  const body = b64url(Buffer.from(JSON.stringify(payload)))
  return `${body}.${sign(body)}`
}

export function verifyStorageToken(token: string, op: StorageOp): TokenPayload | null {
  const [body, mac] = token.split(".")
  if (!body || !mac) return null
  // Constant-time compare against the expected signature.
  const expected = sign(body)
  const a = Buffer.from(mac)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  let payload: TokenPayload
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString()) as TokenPayload
  } catch {
    return null
  }
  if (payload.o !== op) return null
  if (payload.e < Math.floor(Date.now() / 1000)) return null
  return payload
}

function proxyUrl(payload: TokenPayload): string {
  return `${env.NEXT_PUBLIC_APP_URL}/api/storage?token=${encodeURIComponent(makeToken(payload))}`
}

// Async kept to preserve the presigned-URL contract callers already `await`,
// even though minting a proxy token is now synchronous.
// eslint-disable-next-line @typescript-eslint/require-await
export async function generatePresignedPutUrl(
  key: string,
  contentType: string,
  expiresIn = 3600,
): Promise<string> {
  return proxyUrl({ k: key, o: "put", ct: contentType, e: Math.floor(Date.now() / 1000) + expiresIn })
}

// eslint-disable-next-line @typescript-eslint/require-await
export async function generatePresignedGetUrl(key: string, expiresIn = 3600): Promise<string> {
  return proxyUrl({ k: key, o: "get", e: Math.floor(Date.now() / 1000) + expiresIn })
}

// --- Used by the /api/storage proxy route to talk to internal MinIO. --------

export function getObject(key: string, range?: string) {
  return s3.send(new GetObjectCommand({ Bucket: env.MINIO_BUCKET, Key: key, Range: range }))
}

export function putObject(key: string, body: Buffer, contentType?: string) {
  return s3.send(
    new PutObjectCommand({ Bucket: env.MINIO_BUCKET, Key: key, Body: body, ContentType: contentType }),
  )
}
