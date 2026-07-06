/**
 * W-07: POST /api/v1/draft-script — draft a presentation script via the selected
 * or default LLM provider (falls back to env Gemini). Mirrors generation.draftScript.
 * See docs/ios/02-API-CONTRACT.md.
 */
import { type NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/server/db/client"
import { writeAuditLog } from "@/server/services/audit"
import { apiError, apiOk, mapTrpcError, requireWrite, isAuthError } from "@/server/api/rest"
import { draftScriptText } from "@/server/routers/generation"

const bodySchema = z.object({
  topic: z.string().min(3).max(500),
  minutes: z.number().min(0.5).max(30),
  tone: z.enum(["professional", "conversational", "educational", "storytelling"]).default("professional"),
  lang: z.enum(["vi", "en"]).default("vi"),
  providerId: z.string().optional(),
  model: z.string().optional(),
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
    const { script, providerLabel } = await draftScriptText(db, parsed.data)
    await writeAuditLog({ actorId: auth.user.id, action: "generation.draftScript", targetType: "User", targetId: auth.user.id, meta: { topic: parsed.data.topic, minutes: parsed.data.minutes, provider: providerLabel } })
    return apiOk({ script })
  } catch (e) {
    return mapTrpcError(e)
  }
}
