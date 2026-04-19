"use client"

import { useState } from "react"
import { trpc } from "@/lib/trpc/client"

const EDITABLE_SETTINGS = [
  {
    key: "retention.renderDays",
    label: "Render Retention (days)",
    type: "number" as const,
    description: "Whole days only. Use 1 or more days for automatic cleanup.",
  },
  {
    key: "quota.defaultMinutes",
    label: "Default User Quota (min)",
    type: "number" as const,
    description: "Whole minutes only. Zero is allowed for restricted tenants.",
  },
  {
    key: "generation.maxMinutes",
    label: "Max Generation Length (min)",
    type: "number" as const,
    description: "Whole minutes only. Must be at least 1 minute.",
  },
  {
    key: "branding.accentHex",
    label: "Accent Colour (hex)",
    type: "text" as const,
    description: "Use a full 6-digit hex code such as #0F766E.",
  },
]

type EditableSettingKey = (typeof EDITABLE_SETTINGS)[number]["key"]

function validateSetting(key: EditableSettingKey, rawValue: string) {
  const trimmed = rawValue.trim()

  switch (key) {
    case "retention.renderDays": {
      const parsed = Number(trimmed)
      if (!trimmed) return "Retention days is required."
      if (!Number.isInteger(parsed)) return "Retention days must be a whole number."
      if (parsed < 1) return "Retention days must be at least 1."
      return null
    }
    case "quota.defaultMinutes": {
      const parsed = Number(trimmed)
      if (!trimmed) return "Default quota is required."
      if (!Number.isInteger(parsed)) return "Default quota must be a whole number."
      if (parsed < 0) return "Default quota cannot be negative."
      return null
    }
    case "generation.maxMinutes": {
      const parsed = Number(trimmed)
      if (!trimmed) return "Maximum generation length is required."
      if (!Number.isInteger(parsed)) return "Maximum generation length must be a whole number."
      if (parsed < 1) return "Maximum generation length must be at least 1 minute."
      return null
    }
    case "branding.accentHex":
      if (!trimmed) return "Accent colour is required."
      if (!/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return "Accent colour must match #RRGGBB."
      return null
  }
}

function parseSettingValue(key: EditableSettingKey, rawValue: string) {
  if (key === "branding.accentHex") {
    return rawValue.trim().toUpperCase()
  }

  return Number(rawValue)
}

export function SettingsPanel() {
  const { data: settings, refetch } = trpc.admin.getSettings.useQuery()
  const update = trpc.admin.updateSetting.useMutation({ onSuccess: () => refetch() })
  const [editing, setEditing] = useState<EditableSettingKey | null>(null)
  const [value, setValue] = useState("")

  if (!settings) return <div className="animate-pulse h-48 bg-[var(--color-surface-1)] rounded-[var(--radius-card)]" />

  return (
    <div
      className="bg-[var(--color-surface-0)] rounded-[var(--radius-card)] divide-y divide-[var(--color-border)]"
      style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
    >
      {EDITABLE_SETTINGS.map(({ key, label, type, description }) => {
        const current = settings[key]
        const isEditing = editing === key
        const validationError = isEditing ? validateSetting(key, value) : null
        const accentValue = String(isEditing ? value : current ?? "").trim().toUpperCase()
        const showAccentPreview = key === "branding.accentHex" && /^#[0-9A-Fa-f]{6}$/.test(accentValue)

        return (
          <div key={key} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-body-med">{label}</div>
              <div className="text-caption text-[var(--color-text-muted)] font-mono">{key}</div>
              <div className="mt-1 text-micro text-[var(--color-text-muted)]">{description}</div>
            </div>
            <div className="w-full max-w-md">
              {isEditing ? (
                <div className="space-y-2">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <input
                          type={type}
                          value={value}
                          onChange={(e) => setValue(e.target.value)}
                          className="w-full rounded-[var(--radius-md)] border px-3 py-2 text-body-ui"
                          style={{
                            borderColor: validationError ? "var(--color-danger)" : "var(--color-border)",
                            background: "var(--color-surface-0)",
                          }}
                          autoFocus
                        />
                        {key === "branding.accentHex" && (
                          <span
                            className="h-8 w-8 shrink-0 rounded-full border border-[var(--color-border)]"
                            style={{ background: showAccentPreview ? accentValue : "transparent" }}
                            aria-hidden="true"
                          />
                        )}
                      </div>
                      {validationError ? (
                        <p className="mt-1 text-micro text-[var(--color-danger)]">{validationError}</p>
                      ) : (
                        <p className="mt-1 text-micro text-[var(--color-text-muted)]">{description}</p>
                      )}
                      {update.error && (
                        <p className="mt-1 text-micro text-[var(--color-danger)]">{update.error.message}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={async () => {
                          const nextError = validateSetting(key, value)
                          if (nextError) return

                          update.reset()

                          try {
                            await update.mutateAsync({ key, value: parseSettingValue(key, value) })
                            setEditing(null)
                            setValue("")
                          } catch {
                            // The mutation error is rendered inline.
                          }
                        }}
                        disabled={update.isPending || Boolean(validationError)}
                        className="h-9 px-3 rounded-[var(--radius-pill)] bg-black text-white text-caption disabled:opacity-40"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => {
                          setEditing(null)
                          setValue("")
                          update.reset()
                        }}
                        className="text-caption text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-end gap-3">
                  {key === "branding.accentHex" && showAccentPreview && (
                    <span
                      className="h-6 w-6 rounded-full border border-[var(--color-border)]"
                      style={{ background: accentValue }}
                      aria-hidden="true"
                    />
                  )}
                  <span className="text-body-ui font-mono">{String(current)}</span>
                  <button
                    onClick={() => {
                      setEditing(key)
                      setValue(String(current ?? ""))
                      update.reset()
                    }}
                    className="text-caption text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] underline"
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
