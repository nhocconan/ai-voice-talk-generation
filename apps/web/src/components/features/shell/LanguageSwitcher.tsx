"use client"

import { useLocale } from "next-intl"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { cn } from "@/lib/utils"

const LOCALES = [
  { value: "vi", label: "VI" },
  { value: "en", label: "EN" },
] as const

export function LanguageSwitcher() {
  const locale = useLocale()
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const select = (next: string) => {
    if (next === locale) return
    // `i18n/request.ts` resolves the active locale from this cookie server-side.
    document.cookie = `locale=${next};path=/;max-age=31536000;samesite=lax`
    startTransition(() => router.refresh())
  }

  return (
    <div
      role="group"
      aria-label="Language"
      className="inline-flex items-center gap-0.5 rounded-[var(--radius-pill)] border border-[var(--color-border)] p-0.5"
    >
      {LOCALES.map(({ value, label }) => {
        const active = locale === value
        return (
          <button
            key={value}
            type="button"
            onClick={() => select(value)}
            aria-pressed={active}
            disabled={pending}
            className={cn(
              "flex h-7 min-w-7 items-center justify-center rounded-[var(--radius-pill)] px-2 text-micro font-medium transition-colors disabled:opacity-60",
              active
                ? "bg-[var(--color-surface-2)] text-[var(--color-text-primary)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
            )}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
