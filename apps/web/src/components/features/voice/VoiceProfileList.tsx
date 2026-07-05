"use client"

import Link from "next/link"
import { useState } from "react"
import { useTranslations } from "next-intl"
import { trpc } from "@/lib/trpc/client"
import { MicIcon, LockIcon, GlobeIcon, DownloadIcon, Loader2Icon } from "lucide-react"
import { QualityBadge } from "./QualityBadge"

export function VoiceProfileList() {
  const t = useTranslations("voices")
  const { data: profiles, isLoading } = trpc.voiceProfile.list.useQuery()
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  async function handleExport(profileId: string) {
    setDownloadingId(profileId)
    try {
      const res = await fetch(`/api/v1/voice-profiles/${profileId}/export`)
      if (!res.ok) throw new Error(String(res.status))
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const filename =
        res.headers.get("Content-Disposition")?.match(/filename="?([^"]+)"?/)?.[1] ?? `${profileId}.zip`
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } finally {
      setDownloadingId(null)
    }
  }

  if (isLoading) return <ProfileSkeleton />
  if (!profiles?.length) return <EmptyState />

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {profiles.map((profile) => {
        const latestSample = profile.samples.sort((a, b) => b.version - a.version)[0]
        const isDownloading = downloadingId === profile.id
        return (
          <div
            key={profile.id}
            className="bg-[var(--color-surface-0)] rounded-[var(--radius-card)] p-5 h-full"
            style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="w-10 h-10 rounded-full bg-[var(--color-surface-1)] flex items-center justify-center">
                <MicIcon size={18} className="text-[var(--color-text-muted)]" />
              </div>
              <div className="flex items-center gap-1">
                {profile.isLocked && <LockIcon size={12} className="text-[var(--color-text-muted)]" />}
                {profile.isOrgShared && <GlobeIcon size={12} className="text-[var(--color-text-muted)]" />}
                <button
                  type="button"
                  title={t("exportProfile")}
                  aria-label={t("exportProfile")}
                  aria-busy={isDownloading}
                  disabled={isDownloading}
                  onClick={() => void handleExport(profile.id)}
                  className="p-1 rounded-[var(--radius-md)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text-primary)] transition-colors disabled:opacity-50"
                >
                  {isDownloading ? <Loader2Icon size={14} className="animate-spin" /> : <DownloadIcon size={14} />}
                </button>
              </div>
            </div>

            <h3 className="text-body-med truncate">{profile.name}</h3>
            <p className="text-caption text-[var(--color-text-muted)] mt-0.5">
              {profile.lang.toUpperCase()} · {t("samplesCount", { count: profile.samples.length })}
            </p>

            {latestSample && (
              <div className="mt-3">
                <QualityBadge score={latestSample.qualityScore} />
              </div>
            )}

            <p className="text-micro text-[var(--color-text-muted)] mt-3">
              {t("byOwner", { name: profile.owner.name })}
            </p>
          </div>
        )
      })}
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="bg-[var(--color-surface-0)] rounded-[var(--radius-card)] p-5 h-36 animate-pulse"
          style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
        />
      ))}
    </div>
  )
}

function EmptyState() {
  const t = useTranslations("voices")
  return (
    <div className="text-center py-16 rounded-[var(--radius-card)] bg-[var(--color-surface-0)]" style={{ border: "1px dashed var(--color-border)" }}>
      <MicIcon size={32} className="mx-auto text-[var(--color-text-muted)] mb-4" />
      <h3 className="text-body-med">{t("noProfilesTitle")}</h3>
      <p className="text-caption text-[var(--color-text-muted)] mt-1">{t("noProfilesDesc")}</p>
      <Link href="/voices/new" className="mt-4 inline-flex items-center gap-2 h-9 px-4 rounded-[var(--radius-pill)] bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)] text-button hover:opacity-90 transition-opacity">
        + {t("newProfileShort")}
      </Link>
    </div>
  )
}
