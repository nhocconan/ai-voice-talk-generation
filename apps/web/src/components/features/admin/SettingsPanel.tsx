"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { trpc } from "@/lib/trpc/client"

const EDITABLE_SETTINGS = [
  {
    key: "retention.renderDays",
    labelKey: "settings.renderRetentionLabel",
    type: "number" as const,
    descriptionKey: "settings.renderRetentionDesc",
  },
  {
    key: "quota.defaultMinutes",
    labelKey: "settings.defaultQuotaLabel",
    type: "number" as const,
    descriptionKey: "settings.defaultQuotaDesc",
  },
  {
    key: "generation.maxMinutes",
    labelKey: "settings.maxGenerationLabel",
    type: "number" as const,
    descriptionKey: "settings.maxGenerationDesc",
  },
  {
    key: "branding.accentHex",
    labelKey: "settings.accentColourLabel",
    type: "text" as const,
    descriptionKey: "settings.accentColourDesc",
  },
] as const

type EditableSettingKey = (typeof EDITABLE_SETTINGS)[number]["key"]

type TranslateFn = (key: string, values?: Record<string, string | number>) => string

function validateSetting(t: TranslateFn, key: EditableSettingKey, rawValue: string) {
  const trimmed = rawValue.trim()

  switch (key) {
    case "retention.renderDays": {
      const parsed = Number(trimmed)
      if (!trimmed) return t("settings.retentionRequired")
      if (!Number.isInteger(parsed)) return t("settings.retentionInteger")
      if (parsed < 1) return t("settings.retentionMin")
      return null
    }
    case "quota.defaultMinutes": {
      const parsed = Number(trimmed)
      if (!trimmed) return t("settings.quotaRequired")
      if (!Number.isInteger(parsed)) return t("settings.quotaInteger")
      if (parsed < 0) return t("settings.quotaNonNegative")
      return null
    }
    case "generation.maxMinutes": {
      const parsed = Number(trimmed)
      if (!trimmed) return t("settings.maxGenRequired")
      if (!Number.isInteger(parsed)) return t("settings.maxGenInteger")
      if (parsed < 1) return t("settings.maxGenMin")
      return null
    }
    case "branding.accentHex":
      if (!trimmed) return t("settings.accentRequired")
      if (!/^#[0-9A-Fa-f]{6}$/.test(trimmed)) return t("settings.accentFormat")
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
  const t = useTranslations("admin")
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
      {EDITABLE_SETTINGS.map(({ key, labelKey, type, descriptionKey }) => {
        const label = t(labelKey)
        const description = t(descriptionKey)
        const current = settings[key]
        const isEditing = editing === key
        const validationError = isEditing ? validateSetting(t, key, value) : null
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
                          const nextError = validateSetting(t, key, value)
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
                        className="h-9 px-3 rounded-[var(--radius-pill)] bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)] text-caption disabled:opacity-40"
                      >
                        {t("settings.save")}
                      </button>
                      <button
                        onClick={() => {
                          setEditing(null)
                          setValue("")
                          update.reset()
                        }}
                        className="text-caption text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                      >
                        {t("settings.cancel")}
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
                    {t("settings.edit")}
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
