/**
 * W-07: GET /api/v1/generations/{id}/download-urls — fresh presigned output URLs.
 * Mirrors generation.getDownloadUrls. See docs/ios/02-API-CONTRACT.md.
 */
import { type NextRequest } from "next/server"
import { db } from "@/server/db/client"
import { generatePresignedGetUrl } from "@/server/services/storage"
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
    select: { userId: true, status: true, outputMp3Key: true, outputWavKey: true, outputVideoKey: true },
  })
  if (!gen) return apiError(404, "NOT_FOUND", "Generation not found")
  if (!isAdmin(auth.user.role) && gen.userId !== auth.user.id) return apiError(403, "FORBIDDEN", "Not allowed")
  if (gen.status !== "DONE") return apiError(400, "NOT_READY", "Generation is not ready")

  const [mp3Url, wavUrl, videoUrl] = await Promise.all([
    gen.outputMp3Key ? generatePresignedGetUrl(gen.outputMp3Key, 3600) : null,
    gen.outputWavKey ? generatePresignedGetUrl(gen.outputWavKey, 3600) : null,
    gen.outputVideoKey ? generatePresignedGetUrl(gen.outputVideoKey, 3600) : null,
  ])
  return apiOk({ mp3Url, wavUrl, videoUrl })
}
