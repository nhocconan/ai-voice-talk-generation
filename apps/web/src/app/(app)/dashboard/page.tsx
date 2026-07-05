import type { Metadata } from "next"
import { getTranslations } from "next-intl/server"
import { auth } from "@/server/auth"
import { db } from "@/server/db/client"
import Link from "next/link"
import { MicIcon, PlayCircleIcon, ClockIcon } from "lucide-react"

export const metadata: Metadata = { title: "Dashboard" }

export default async function DashboardPage() {
  const session = await auth()
  if (!session) return null

  const t = await getTranslations("dashboard")

  const [profileCount, recentGens, user] = await Promise.all([
    db.voiceProfile.count({ where: { OR: [{ ownerId: session.user.id }, { isOrgShared: true }] } }),
    db.generation.findMany({
      where: { userId: session.user.id },
      take: 5,
      orderBy: { createdAt: "desc" },
      include: { provider: { select: { name: true } } },
    }),
    db.user.findUnique({ where: { id: session.user.id }, select: { quotaMinutes: true, usedMinutes: true, name: true } }),
  ])

  const quotaPct = user ? Math.round((user.usedMinutes / user.quotaMinutes) * 100) : 0

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-display-card">{t("welcomeUser", { name: user?.name ?? "" })}</h1>
        <p className="text-body text-[var(--color-text-secondary)] mt-1">{t("subtitle")}</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard icon={<MicIcon size={20} />} label={t("voiceProfiles")} value={profileCount} href="/voices" />
        <StatCard icon={<PlayCircleIcon size={20} />} label={t("totalGenerations")} value={recentGens.length} href="/history" />
        <div
          className="bg-[var(--color-surface-0)] rounded-[var(--radius-card)] p-6"
          style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <ClockIcon size={20} className="text-[var(--color-text-muted)]" />
            <span className="text-caption text-[var(--color-text-muted)]">{t("monthlyQuota")}</span>
          </div>
          <div className="text-display-card mb-2">{user?.usedMinutes ?? 0} / {user?.quotaMinutes ?? 0} {t("minShort")}</div>
          <div className="h-2 bg-[var(--color-surface-1)] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.min(quotaPct, 100)}%`,
                backgroundColor: quotaPct > 80 ? "var(--color-accent)" : "var(--color-text-primary)",
              }}
            />
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div>
        <h2 className="text-body-med mb-4">{t("quickStart")}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <ActionCard href="/generate" label={t("newPresentation")} desc={t("newPresentationDesc")} />
          <ActionCard href="/generate/podcast" label={t("newPodcast")} desc={t("newPodcastDesc")} />
          <ActionCard href="/generate/revoice" label={t("reVoiceAudio")} desc={t("reVoiceAudioDesc")} />
        </div>
      </div>

      {/* Recent generations */}
      {recentGens.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-body-med">{t("recent")}</h2>
            <Link href="/history" className="text-caption text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
              {t("viewAll")} →
            </Link>
          </div>
          <div className="space-y-2">
            {recentGens.map((g) => (
              <Link key={g.id} href={`/history/${g.id}`} className="block">
                <div
                  className="flex items-center justify-between p-4 rounded-[var(--radius-md)] hover:bg-[var(--color-surface-1)] transition-colors"
                  style={{ border: "1px solid var(--color-border)" }}
                >
                  <div>
                    <span className="text-body-ui">{g.kind}</span>
                    <span className="text-caption text-[var(--color-text-muted)] ml-2">{g.provider.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={g.status} />
                    <span className="text-caption text-[var(--color-text-muted)]">{g.createdAt.toLocaleDateString()}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: number; href: string }) {
  return (
    <Link href={href}>
      <div
        className="bg-[var(--color-surface-0)] rounded-[var(--radius-card)] p-6 hover:bg-[var(--color-surface-1)] transition-colors"
        style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[var(--color-text-muted)]">{icon}</span>
          <span className="text-caption text-[var(--color-text-muted)]">{label}</span>
        </div>
        <div className="text-display-card">{value}</div>
      </div>
    </Link>
  )
}

function ActionCard({ href, label, desc }: { href: string; label: string; desc: string }) {
  return (
    <Link href={href}>
      <div
        className="bg-[var(--color-surface-warm-tr,var(--color-surface-warm))] rounded-[var(--radius-warm-btn)] p-6 hover:opacity-90 transition-opacity"
        style={{ boxShadow: "var(--shadow-warm-lift)" }}
      >
        <div className="text-body-med">{label}</div>
        <div className="text-caption text-[var(--color-text-muted)] mt-1">{desc}</div>
      </div>
    </Link>
  )
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    DONE: "text-[var(--color-success)]",
    FAILED: "text-[var(--color-danger)]",
    QUEUED: "text-[var(--color-text-muted)]",
    RUNNING: "text-[var(--color-info)]",
    CANCELLED: "text-[var(--color-text-muted)]",
  }
  return <span className={`text-micro uppercase ${colors[status] ?? ""}`}>{status}</span>
}
