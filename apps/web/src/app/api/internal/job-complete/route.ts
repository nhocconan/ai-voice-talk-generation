/**
 * W-14: internal completion hook. The worker calls this when a render reaches a
 * terminal state; it fires the outbound webhook (P4-04) and APNs push (W-14).
 *
 * Auth: shared secret in `x-internal-token` (env INTERNAL_API_TOKEN, falling back
 * to SERVER_SECRET). Not part of the public `/api/v1` surface.
 */
import { type NextRequest, NextResponse } from "next/server"
import crypto from "crypto"
import { z } from "zod"
import { env } from "@/env"
import { db } from "@/server/db/client"
import { fireWebhook } from "@/server/services/webhook"
import { sendJobCompletionPush } from "@/server/services/push"

const bodySchema = z.object({ generationId: z.string().min(1) })

function tokenOk(provided: string | null): boolean {
  const expected = process.env["INTERNAL_API_TOKEN"] ?? env.SERVER_SECRET
  if (!provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export async function POST(req: NextRequest) {
  if (!tokenOk(req.headers.get("x-internal-token"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) return NextResponse.json({ error: "generationId required" }, { status: 400 })

  const gen = await db.generation.findUnique({
    where: { id: parsed.data.generationId },
    select: { id: true, kind: true, status: true, userId: true, durationMs: true, errorMessage: true, outputMp3Key: true, finishedAt: true },
  })
  if (!gen) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (gen.status !== "DONE" && gen.status !== "FAILED") {
    return new NextResponse(null, { status: 204 }) // non-terminal — nothing to notify
  }

  await Promise.all([
    fireWebhook({
      event: gen.status === "DONE" ? "generation.done" : "generation.failed",
      generationId: gen.id,
      kind: gen.kind,
      status: gen.status,
      userId: gen.userId,
      durationMs: gen.durationMs,
      errorMessage: gen.errorMessage,
      mp3Key: gen.outputMp3Key,
      finishedAt: gen.finishedAt?.toISOString() ?? null,
    }),
    sendJobCompletionPush(gen.userId, { generationId: gen.id, kind: gen.kind, status: gen.status }),
  ])

  return new NextResponse(null, { status: 204 })
}
