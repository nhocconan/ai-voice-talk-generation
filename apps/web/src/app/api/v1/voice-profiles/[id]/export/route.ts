import JSZip from "jszip"
import { type NextRequest } from "next/server"
import { db } from "@/server/db/client"
import { generatePresignedGetUrl } from "@/server/services/storage"
import { writeAuditLog } from "@/server/services/audit"
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
  const profile = await db.voiceProfile.findUnique({
    where: { id },
    include: { samples: { orderBy: { version: "asc" } } },
  })

  if (!profile) {
    return new Response("Not found", { status: 404 })
  }

  const isAdmin = caller.role === "ADMIN" || caller.role === "SUPER_ADMIN"
  if (!isAdmin && profile.ownerId !== caller.userId) {
    return new Response("Forbidden", { status: 403 })
  }

  const zip = new JSZip()
  const manifestSamples = []

  for (const sample of profile.samples) {
    const ext = sample.storageKey.split(".").pop() ?? "audio"
    const filename = `v${sample.version}.${ext}`

    const url = await generatePresignedGetUrl(sample.storageKey, 300)
    const res = await fetch(url)
    if (!res.ok) {
      return new Response(`Failed to fetch sample v${sample.version}`, { status: 502 })
    }
    zip.file(`samples/${filename}`, new Uint8Array(await res.arrayBuffer()))

    manifestSamples.push({
      version: sample.version,
      filename,
      durationMs: sample.durationMs,
      sampleRate: sample.sampleRate,
      qualityScore: sample.qualityScore,
      qualityDetail: sample.qualityDetail,
      notes: sample.notes,
      createdAt: sample.createdAt.toISOString(),
    })
  }

  const manifest = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    profile: {
      name: profile.name,
      lang: profile.lang,
      consent: profile.consent,
      activeVersion: profile.activeVersion,
    },
    samples: manifestSamples,
  }
  zip.file("profile.json", JSON.stringify(manifest, null, 2))

  const content = await zip.generateAsync({ type: "arraybuffer" })

  await writeAuditLog({
    actorId: caller.userId,
    action: "voiceProfile.export",
    targetType: "VoiceProfile",
    targetId: id,
    meta: { samples: profile.samples.length },
  })

  const safeName = profile.name.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 40) || "profile"

  return new Response(content, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${safeName}-${id}.zip"`,
      "Content-Length": String(content.byteLength),
    },
  })
}
