"use client"

import { useState } from "react"
import { trpc } from "@/lib/trpc/client"

const EDITABLE_SETTINGS = [
  { key: "retention.renderDays", label: "Render Retention (days)", type: "number" as const },
  { key: "quota.defaultMinutes", label: "Default User Quota (min)", type: "number" as const },
  { key: "generation.maxMinutes", label: "Max Generation Length (min)", type: "number" as const },
  { key: "branding.accentHex", label: "Accent Colour (hex)", type: "text" as const },
]

export function SettingsPanel() {
  const { data: settings, refetch } = trpc.admin.getSettings.useQuery()
  const update = trpc.admin.updateSetting.useMutation({ onSuccess: () => refetch() })
  const [editing, setEditing] = useState<string | null>(null)
  const [value, setValue] = useState("")

  if (!settings) return <div className="animate-pulse h-48 bg-[var(--color-surface-1)] rounded-[var(--radius-card)]" />

  return (
    <div
      className="bg-[var(--color-surface-0)] rounded-[var(--radius-card)] divide-y"
      style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)", divideColor: "var(--color-border)" }}
    >
      {EDITABLE_SETTINGS.map(({ key, label, type }) => {
        const current = settings[key]
        const isEditing = editing === key

        return (
          <div key={key} className="flex items-center justify-between p-5">
            <div>
              <div className="text-body-med">{label}</div>
              <div className="text-caption text-[var(--color-text-muted)] font-mono">{key}</div>
            </div>
            <div className="flex items-center gap-3">
              {isEditing ? (
                <>
                  <input
                    type={type}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="w-32 px-2 py-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui text-right"
                    autoFocus
                  />
                  <button
                    onClick={async () => {
                      const v = type === "number" ? Number(value) : value
                      await update.mutateAsync({ key, value: v })
                      setEditing(null)
                    }}
                    disabled={update.isPending}
                    className="h-8 px-3 rounded-[var(--radius-pill)] bg-black text-white text-caption"
                  >
                    Save
                  </button>
                  <button onClick={() => setEditing(null)} className="text-caption text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <span className="text-body-ui font-mono">{String(current)}</span>
                  <button
                    onClick={() => { setEditing(key); setValue(String(current)) }}
                    className="text-caption text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] underline"
                  >
                    Edit
                  </button>
                </>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
