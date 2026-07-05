"use client"

import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { type Theme, useTheme } from "./ThemeProvider"

const OPTIONS: { value: Theme; icon: typeof SunIcon; key: "light" | "system" | "dark" }[] = [
  { value: "light", icon: SunIcon, key: "light" },
  { value: "system", icon: MonitorIcon, key: "system" },
  { value: "dark", icon: MoonIcon, key: "dark" },
]

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const t = useTranslations("theme")

  return (
    <div
      role="group"
      aria-label={t("label")}
      className="inline-flex items-center gap-0.5 rounded-[var(--radius-pill)] border border-[var(--color-border)] p-0.5"
    >
      {OPTIONS.map(({ value, icon: Icon, key }) => {
        const active = theme === value
        return (
          <button
            key={value}
            type="button"
            onClick={() => setTheme(value)}
            aria-pressed={active}
            aria-label={t(key)}
            title={t(key)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-[var(--radius-pill)] transition-colors",
              active
                ? "bg-[var(--color-surface-2)] text-[var(--color-text-primary)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
            )}
          >
            <Icon size={14} />
          </button>
        )
      })}
    </div>
  )
}
