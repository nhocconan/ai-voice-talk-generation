/**
 * W-07: GET /api/v1/generations/{id} — one generation with speakers/provider.
 * Mirrors generation.get. See docs/ios/02-API-CONTRACT.md.
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
    include: { provider: true, speakers: { include: { profile: true } } },
  })
  if (!gen) return apiError(404, "NOT_FOUND", "Generation not found")
  if (!isAdmin(auth.user.role) && gen.userId !== auth.user.id) return apiError(403, "FORBIDDEN", "Not allowed")
  return apiOk({ generation: gen })
}
