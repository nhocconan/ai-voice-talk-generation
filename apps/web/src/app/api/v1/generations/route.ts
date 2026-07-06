/**
 * W-07: GET /api/v1/generations — paginated list of the caller's generations.
 * Mirrors generation.list. See docs/ios/02-API-CONTRACT.md.
 */
import { type NextRequest } from "next/server"
import { db } from "@/server/db/client"
import { apiOk, authenticate, isAuthError } from "@/server/api/rest"

function isAdmin(role: string): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN"
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req)
  if (isAuthError(auth)) return auth

  const url = req.nextUrl
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1)
  const pageSize = Math.min(50, Math.max(1, Number(url.searchParams.get("pageSize") ?? "20") || 20))
  const where = isAdmin(auth.user.role) ? {} : { userId: auth.user.id }

  const [items, total] = await Promise.all([
    db.generation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        provider: { select: { name: true } },
        speakers: { include: { profile: { select: { name: true } } } },
      },
    }),
    db.generation.count({ where }),
  ])
  return apiOk({ items, total, page, pageSize })
}
