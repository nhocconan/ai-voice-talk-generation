/**
 * W-07: POST /api/v1/generate/preview — 15-second audition before a full render.
 * Mirrors generation.previewPresentation. See docs/ios/02-API-CONTRACT.md.
 */
import { type NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/server/db/client"
import { apiError, apiOk, mapTrpcError, requireWrite, isAuthError } from "@/server/api/rest"
import { assertProfilesReady, resolveProvider } from "@/server/routers/generation"

const bodySchema = z.object({
  profileId: z.string().min(1),
  script: z.string().min(10),
  providerId: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const auth = await requireWrite(req)
  if (isAuthError(auth)) return auth

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return apiError(400, "VALIDATION", "Invalid JSON body")
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) return apiError(400, "VALIDATION", parsed.error.issues[0]?.message ?? "Validation error")

  try {
    const providerId = await resolveProvider({ db }, parsed.data.providerId)
    await assertProfilesReady(db, [parsed.data.profileId], providerId)

    const workerUrl = process.env["WORKER_URL"] ?? "http://localhost:8001"
    const resp = await fetch(`${workerUrl}/preview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider_id: providerId, profile_id: parsed.data.profileId, script: parsed.data.script, max_chars: 250 }),
    })
    if (!resp.ok) {
      const err = (await resp.json().catch(() => ({ error: "Worker error" }))) as { error?: string }
      return apiError(502, "PREVIEW_FAILED", err.error ?? "Preview failed")
    }
    const data = (await resp.json()) as { url: string }
    return apiOk({ previewUrl: data.url })
  } catch (e) {
    return mapTrpcError(e)
  }
}
