"use client"

import { useState } from "react"
import { trpc } from "@/lib/trpc/client"
import { QualityBadge } from "@/components/features/voice/QualityBadge"

export function VoiceLibraryManager() {
  const utils = trpc.useUtils()
  const { data: profiles, isLoading } = trpc.voiceProfile.list.useQuery()
  const setOrgShared = trpc.voiceProfile.setOrgShared.useMutation({
    onSuccess: () => utils.voiceProfile.list.invalidate(),
  })
  const setLocked = trpc.voiceProfile.setLocked.useMutation({
    onSuccess: () => utils.voiceProfile.list.invalidate(),
  })
  const [search, setSearch] = useState("")

  const filtered = profiles?.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.owner?.email?.toLowerCase().includes(search.toLowerCase())
  ) ?? []

  if (isLoading) {
    return <p className="text-body text-[var(--color-text-muted)]">Loading...</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or owner…"
          className="w-72 px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui"
        />
        <span className="text-caption text-[var(--color-text-muted)]">{filtered.length} profile(s)</span>
      </div>

      <div
        className="rounded-[var(--radius-card)] overflow-hidden"
        style={{ border: "1px solid var(--color-border)" }}
      >
        <table className="w-full text-left">
          <thead className="bg-[var(--color-surface-1)]">
            <tr>
              {["Name", "Owner", "Lang", "Quality", "Org Shared", "Locked", "Actions"].map((h) => (
                <th key={h} className="px-4 py-3 text-caption text-[var(--color-text-secondary)]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-body text-[var(--color-text-muted)]">
                  No voice profiles found.
                </td>
              </tr>
            )}
            {filtered.map((profile) => {
              const bestSample = profile.samples.reduce<(typeof profile.samples)[0] | null>(
                (best, s) => (!best || (s.qualityScore ?? 0) > (best.qualityScore ?? 0) ? s : best),
                null,
              )
              return (
                <tr key={profile.id} className="border-t border-[var(--color-border)] hover:bg-[var(--color-surface-1)] transition-colors">
                  <td className="px-4 py-3 text-body-ui font-medium">{profile.name}</td>
                  <td className="px-4 py-3 text-caption text-[var(--color-text-secondary)]">
                    {profile.owner?.name ?? profile.owner?.email ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-caption uppercase">{profile.lang}</td>
                  <td className="px-4 py-3">
                    {bestSample?.qualityScore != null ? (
                      <QualityBadge score={bestSample.qualityScore} />
                    ) : (
                      <span className="text-caption text-[var(--color-text-muted)]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setOrgShared.mutate({ id: profile.id, shared: !profile.isOrgShared })}
                      disabled={setOrgShared.isPending}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-50 ${
                        profile.isOrgShared ? "bg-[var(--color-accent)]" : "bg-[var(--color-border)]"
                      }`}
                      role="switch"
                      aria-checked={profile.isOrgShared}
                      aria-label={`Toggle org-shared for ${profile.name}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
                          profile.isOrgShared ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setLocked.mutate({ id: profile.id, locked: !profile.isLocked })}
                      disabled={setLocked.isPending}
                      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none disabled:opacity-50 ${
                        profile.isLocked ? "bg-[var(--color-warning)]" : "bg-[var(--color-border)]"
                      }`}
                      role="switch"
                      aria-checked={profile.isLocked}
                      aria-label={`Toggle locked for ${profile.name}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform ${
                          profile.isLocked ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {profile.isOrgShared && (
                        <span className="text-micro px-2 py-0.5 rounded-full bg-[var(--color-accent)]18 text-[var(--color-accent)]">
                          Shared
                        </span>
                      )}
                      {profile.isLocked && (
                        <span className="text-micro px-2 py-0.5 rounded-full bg-[var(--color-warning)]18 text-[var(--color-warning)]">
                          Locked
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
