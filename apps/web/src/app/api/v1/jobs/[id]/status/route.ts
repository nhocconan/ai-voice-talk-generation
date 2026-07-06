/**
 * W-09: GET /api/v1/jobs/{id}/status — polling fallback for job progress when the
 * SSE stream (W-10) is unavailable (background / flaky mobile networks).
 *
 * Returns the durable snapshot from the Generation row. Live `phase`/`progress`
 * are published transiently over Redis to the SSE channel; persisting them for
 * polling is W-15, so they are null here until then. Terminal states (DONE/
 * FAILED/CANCELLED) are always reflected. See docs/ios/02-API-CONTRACT.md §7.
 */
import { type NextRequest } from "next/server"
import { db } from "@/server/db/client"
import { apiError, apiOk, authenticate, isAuthError } from "@/server/api/rest"

function isAdmin(role: string): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN"
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticate(req)
  if (isAuthError(auth)) return auth
  const { id } = await params

  const gen = await db.generation.findUnique({
    where: { id },
    select: { userId: true, status: true, errorMessage: true, startedAt: true, finishedAt: true, durationMs: true },
  })
  if (!gen) return apiError(404, "NOT_FOUND", "Job not found")
  if (!isAdmin(auth.user.role) && gen.userId !== auth.user.id) return apiError(403, "FORBIDDEN", "Not allowed")

  const progress = gen.status === "DONE" ? 1 : gen.status === "QUEUED" ? 0 : null
  return apiOk({
    status: gen.status,
    phase: null,
    progress,
    message: null,
    errorMessage: gen.errorMessage,
    durationMs: gen.durationMs,
    startedAt: gen.startedAt,
    finishedAt: gen.finishedAt,
    updatedAt: gen.finishedAt ?? gen.startedAt ?? null,
  })
}
