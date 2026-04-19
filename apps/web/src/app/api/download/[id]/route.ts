import { redirect } from "next/navigation"
import { auth } from "@/server/auth"
import { db } from "@/server/db/client"
import { generatePresignedGetUrl } from "@/server/services/storage"

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) {
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

  const isAdmin = session.user.role === "ADMIN" || session.user.role === "SUPER_ADMIN"
  if (!isAdmin && generation.userId !== session.user.id) {
    return new Response("Forbidden", { status: 403 })
  }

  const downloadKey = generation.outputMp3Key ?? generation.outputWavKey
  if (generation.status !== "DONE" || !downloadKey) {
    return new Response("Generation is not ready", { status: 400 })
  }

  redirect(await generatePresignedGetUrl(downloadKey, 300))
}
