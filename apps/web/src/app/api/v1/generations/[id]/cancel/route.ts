/**
 * W-07: POST /api/v1/generations/{id}/cancel — cancel a QUEUED job.
 * Mirrors generation.cancel. See docs/ios/02-API-CONTRACT.md.
 */
import { type NextRequest } from "next/server"
import { db } from "@/server/db/client"
import { writeAuditLog } from "@/server/services/audit"
import { GenStatus } from "@prisma/client"
import { apiError, apiOk, requireWrite, isAuthError } from "@/server/api/rest"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireWrite(req)
  if (isAuthError(auth)) return auth
  const { id } = await params

  const gen = await db.generation.findUnique({ where: { id }, select: { userId: true, status: true } })
  if (!gen) return apiError(404, "NOT_FOUND", "Generation not found")
  if (gen.userId !== auth.user.id) return apiError(403, "FORBIDDEN", "Not allowed")
  if (gen.status !== GenStatus.QUEUED) return apiError(400, "NOT_CANCELLABLE", "Only queued jobs can be cancelled")

  await db.generation.update({ where: { id }, data: { status: GenStatus.CANCELLED } })
  await writeAuditLog({ actorId: auth.user.id, action: "generation.cancel", targetType: "Generation", targetId: id })
  return apiOk({ ok: true, status: "CANCELLED" })
}
