"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useTranslations } from "next-intl"

declare global {
  interface Window {
    grecaptcha?: {
      ready: (cb: () => void) => void
      execute: (siteKey: string, opts: { action: string }) => Promise<string>
      getResponse: (widgetId?: number) => string
      reset: (widgetId?: number) => void
    }
  }
}

const schema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Required"),
})
type FormData = z.infer<typeof schema>

interface RecaptchaProps {
  siteKey: string
  version: "v2" | "v3"
}

export function LoginForm({ recaptcha }: { recaptcha: RecaptchaProps | null }) {
  const t = useTranslations("auth")
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [remember, setRemember] = useState(true)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  // Load the Google reCAPTCHA script once when enabled.
  useEffect(() => {
    if (!recaptcha) return
    const src =
      recaptcha.version === "v3"
        ? `https://www.google.com/recaptcha/api.js?render=${recaptcha.siteKey}`
        : "https://www.google.com/recaptcha/api.js"
    if (document.querySelector(`script[src^="https://www.google.com/recaptcha/api.js"]`)) return
    const s = document.createElement("script")
    s.src = src
    s.async = true
    s.defer = true
    document.head.appendChild(s)
  }, [recaptcha])

  // Returns "" when reCAPTCHA is off, a token on success, or null to abort.
  const getRecaptchaToken = async (): Promise<string | null> => {
    if (!recaptcha) return ""
    const g = window.grecaptcha
    if (!g) {
      setError(t("captchaNotReady"))
      return null
    }
    if (recaptcha.version === "v3") {
      return g.execute(recaptcha.siteKey, { action: "login" })
    }
    const token = g.getResponse()
    if (!token) {
      setError(t("captchaRequired"))
      return null
    }
    return token
  }

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    setError(null)
    try {
      const recaptchaToken = await getRecaptchaToken()
      if (recaptchaToken === null) {
        setLoading(false)
        return
      }
      const res = await signIn("credentials", {
        email: data.email,
        password: data.password,
        rememberMe: String(remember),
        recaptchaToken,
        redirect: false,
      })
      if (res?.error) {
        setError(t("invalidCredentials"))
        if (recaptcha?.version === "v2") window.grecaptcha?.reset()
      } else {
        router.push("/dashboard")
        router.refresh()
      }
    } catch {
      setError(t("genericError"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-caption mb-1.5">{t("emailLabel")}</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          {...register("email")}
          className="w-full px-3 py-2.5 rounded-[var(--radius-md)] bg-[var(--color-surface-0)] text-body-ui border border-[var(--color-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
          placeholder="you@example.com"
        />
        {errors.email && <p className="text-micro text-[var(--color-danger)] mt-1">{errors.email.message}</p>}
      </div>

      <div>
        <label htmlFor="password" className="block text-caption mb-1.5">{t("passwordLabel")}</label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          {...register("password")}
          className="w-full px-3 py-2.5 rounded-[var(--radius-md)] bg-[var(--color-surface-0)] text-body-ui border border-[var(--color-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
          placeholder="••••••••"
        />
        {errors.password && <p className="text-micro text-[var(--color-danger)] mt-1">{errors.password.message}</p>}
      </div>

      {error && (
        <div className="text-body-ui text-[var(--color-danger)] bg-[var(--color-accent-soft)] rounded-[var(--radius-md)] px-3 py-2">
          {error}
        </div>
      )}

      <label className="flex items-center gap-2 text-caption text-[var(--color-text-secondary)] select-none">
        <input
          type="checkbox"
          checked={remember}
          onChange={(e) => setRemember(e.target.checked)}
          className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
        />
        {t("rememberMe")}
      </label>

      {recaptcha?.version === "v2" && (
        <div className="g-recaptcha" data-sitekey={recaptcha.siteKey} />
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full h-10 rounded-[var(--radius-pill)] bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)] text-button disabled:opacity-50 hover:opacity-90 transition-opacity"
      >
        {loading ? t("signingIn") : t("signIn")}
      </button>

      <p className="text-center text-caption text-[var(--color-text-muted)]">
        <Link href="/forgot-password" className="text-[var(--color-accent)] hover:underline">
          {t("forgotPassword")}
        </Link>
      </p>
    </form>
  )
}
