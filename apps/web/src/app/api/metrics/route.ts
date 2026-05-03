import { NextResponse } from "next/server"
import { db } from "@/server/db/client"
import { GenStatus } from "@prisma/client"

// P3-06: Prometheus text format metrics endpoint.
// Scrape with: prometheus.yml scrape_configs job target http://web:3000/api/metrics
// Protect in production by placing behind Caddy auth or network policy.

export const dynamic = "force-dynamic"

async function buildMetrics(): Promise<string> {
  const [
    totalUsers,
    activeUsers,
    totalProfiles,
    queuedGens,
    runningGens,
    doneGens,
    failedGens,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { active: true } }),
    db.voiceProfile.count(),
    db.generation.count({ where: { status: GenStatus.QUEUED } }),
    db.generation.count({ where: { status: GenStatus.RUNNING } }),
    db.generation.count({ where: { status: GenStatus.DONE } }),
    db.generation.count({ where: { status: GenStatus.FAILED } }),
  ])

  const lines: string[] = [
    "# HELP voice_users_total Total registered users",
    "# TYPE voice_users_total gauge",
    `voice_users_total ${totalUsers}`,
    "",
    "# HELP voice_users_active Active (non-deactivated) users",
    "# TYPE voice_users_active gauge",
    `voice_users_active ${activeUsers}`,
    "",
    "# HELP voice_profiles_total Total voice profiles",
    "# TYPE voice_profiles_total gauge",
    `voice_profiles_total ${totalProfiles}`,
    "",
    "# HELP voice_generations_queued Queued render jobs",
    "# TYPE voice_generations_queued gauge",
    `voice_generations_queued ${queuedGens}`,
    "",
    "# HELP voice_generations_running Currently running render jobs",
    "# TYPE voice_generations_running gauge",
    `voice_generations_running ${runningGens}`,
    "",
    "# HELP voice_generations_done Completed render jobs",
    "# TYPE voice_generations_done counter",
    `voice_generations_done ${doneGens}`,
    "",
    "# HELP voice_generations_failed Failed render jobs",
    "# TYPE voice_generations_failed counter",
    `voice_generations_failed ${failedGens}`,
  ]

  return lines.join("\n") + "\n"
}

export async function GET() {
  try {
    const body = await buildMetrics()
    return new NextResponse(body, {
      headers: { "Content-Type": "text/plain; version=0.0.4" },
    })
  } catch (err) {
    return new NextResponse(`# scrape error: ${String(err)}\n`, {
      status: 500,
      headers: { "Content-Type": "text/plain; version=0.0.4" },
    })
  }
}
