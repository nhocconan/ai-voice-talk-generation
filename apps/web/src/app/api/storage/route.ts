/**
 * App-proxied object storage. MinIO is internal-only; this route is the public
 * (Traefik-reachable) door for browser/mobile uploads and downloads. Access is
 * authorized entirely by the HMAC-signed token minted in services/storage.ts —
 * no session needed, the token IS the capability (one key + op, time-limited).
 */
import { type NextRequest } from "next/server"
import { verifyStorageToken, getObject, putObject } from "@/server/services/storage"

// Streams + aws-sdk need the Node runtime, not edge.
export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")
  const payload = token ? verifyStorageToken(token, "get") : null
  if (!payload) return new Response("Invalid or expired token", { status: 403 })

  const range = req.headers.get("range") ?? undefined
  try {
    const obj = await getObject(payload.k, range)
    const body = obj.Body?.transformToWebStream()
    if (!body) return new Response("Not found", { status: 404 })

    const headers = new Headers({ "Accept-Ranges": "bytes" })
    if (obj.ContentType) headers.set("Content-Type", obj.ContentType)
    if (obj.ContentLength != null) headers.set("Content-Length", String(obj.ContentLength))
    if (obj.ContentRange) headers.set("Content-Range", obj.ContentRange)

    return new Response(body, { status: obj.ContentRange ? 206 : 200, headers })
  } catch (e) {
    const name = (e as { name?: string }).name
    if (name === "NoSuchKey" || name === "NotFound") return new Response("Not found", { status: 404 })
    return new Response("Storage error", { status: 502 })
  }
}

export async function PUT(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")
  const payload = token ? verifyStorageToken(token, "put") : null
  if (!payload) return new Response("Invalid or expired token", { status: 403 })

  const buf = Buffer.from(await req.arrayBuffer())
  try {
    await putObject(payload.k, buf, payload.ct ?? req.headers.get("content-type") ?? undefined)
    return new Response(null, { status: 200 })
  } catch {
    return new Response("Storage error", { status: 502 })
  }
}
