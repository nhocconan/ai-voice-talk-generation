import { redirect } from "next/navigation"
import { type NextRequest } from "next/server"
import { db } from "@/server/db/client"
import { generatePresignedGetUrl } from "@/server/services/storage"
import { resolveSessionOrBearer } from "@/server/api/rest"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Accepts a web session cookie or a mobile Bearer access token (W-10).
  const caller = await resolveSessionOrBearer(request)
  if (!caller) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { id } = await params
  const generation = await db.generation.findUnique({
    where: { id },
    select: {
      userId: true,
      status: true,
      outputMp3Key: true,
      outputWavKey: true,
    },
  })

  if (!generation) {
    return new Response("Not found", { status: 404 })
  }

  const isAdmin = caller.role === "ADMIN" || caller.role === "SUPER_ADMIN"
  if (!isAdmin && generation.userId !== caller.userId) {
    return new Response("Forbidden", { status: 403 })
  }

  const downloadKey = generation.outputMp3Key ?? generation.outputWavKey
  if (generation.status !== "DONE" || !downloadKey) {
    return new Response("Generation is not ready", { status: 400 })
  }

  redirect(await generatePresignedGetUrl(downloadKey, 300))
}
