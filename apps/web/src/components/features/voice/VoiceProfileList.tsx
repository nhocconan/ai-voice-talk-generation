"use client"

import Link from "next/link"
import { trpc } from "@/lib/trpc/client"
import { MicIcon, LockIcon, GlobeIcon } from "lucide-react"
import { QualityBadge } from "./QualityBadge"

export function VoiceProfileList() {
  const { data: profiles, isLoading } = trpc.voiceProfile.list.useQuery()

  if (isLoading) return <ProfileSkeleton />
  if (!profiles?.length) return <EmptyState />

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {profiles.map((profile) => {
        const latestSample = profile.samples.sort((a, b) => b.version - a.version)[0]
        return (
          <Link key={profile.id} href={`/app/voices/${profile.id}`}>
            <div
              className="bg-[var(--color-surface-0)] rounded-[var(--radius-card)] p-5 hover:bg-[var(--color-surface-1)] transition-colors h-full"
              style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-full bg-[var(--color-surface-1)] flex items-center justify-center">
                  <MicIcon size={18} className="text-[var(--color-text-muted)]" />
                </div>
                <div className="flex items-center gap-1">
                  {profile.isLocked && <LockIcon size={12} className="text-[var(--color-text-muted)]" />}
                  {profile.isOrgShared && <GlobeIcon size={12} className="text-[var(--color-text-muted)]" />}
                </div>
              </div>

              <h3 className="text-body-med truncate">{profile.name}</h3>
              <p className="text-caption text-[var(--color-text-muted)] mt-0.5">
                {profile.lang.toUpperCase()} · {profile.samples.length} sample{profile.samples.length !== 1 ? "s" : ""}
              </p>

              {latestSample && (
                <div className="mt-3">
                  <QualityBadge score={latestSample.qualityScore} />
                </div>
              )}

              <p className="text-micro text-[var(--color-text-muted)] mt-3">
                By {profile.owner.name}
              </p>
            </div>
          </Link>
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
  return (
    <div className="text-center py-16 rounded-[var(--radius-card)] bg-[var(--color-surface-0)]" style={{ border: "1px dashed var(--color-border)" }}>
      <MicIcon size={32} className="mx-auto text-[var(--color-text-muted)] mb-4" />
      <h3 className="text-body-med">No voice profiles yet</h3>
      <p className="text-caption text-[var(--color-text-muted)] mt-1">Create one to start generating audio.</p>
      <Link href="/app/voices/new" className="mt-4 inline-flex items-center gap-2 h-9 px-4 rounded-[var(--radius-pill)] bg-black text-white text-button hover:opacity-90 transition-opacity">
        + New Profile
      </Link>
    </div>
  )
}
