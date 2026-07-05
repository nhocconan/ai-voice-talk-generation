"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { api } from "@/lib/trpc/client"

const schema = z.object({ email: z.string().email("Invalid email") })
type FormData = z.infer<typeof schema>

export function ForgotPasswordForm() {
  const t = useTranslations("auth")
  const [submitted, setSubmitted] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const forgotPassword = api.auth.forgotPassword.useMutation({
    onSuccess: () => setSubmitted(true),
  })

  if (submitted) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-body-ui text-[var(--color-text-primary)]">
          {t("resetLinkSent")}
        </p>
        <Link href="/login" className="text-caption text-[var(--color-accent)] hover:underline">
          {t("backToSignIn")}
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit((data) => forgotPassword.mutate(data))} className="space-y-4">
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

      {forgotPassword.error && (
        <div className="text-body-ui text-[var(--color-danger)] bg-[var(--color-accent-soft)] rounded-[var(--radius-md)] px-3 py-2">
          {forgotPassword.error.message}
        </div>
      )}

      <button
        type="submit"
        disabled={forgotPassword.isPending}
        className="w-full h-10 rounded-[var(--radius-pill)] bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)] text-button disabled:opacity-50 hover:opacity-90 transition-opacity"
      >
        {forgotPassword.isPending ? t("sending") : t("sendResetLink")}
      </button>

      <p className="text-center text-caption text-[var(--color-text-muted)]">
        <Link href="/login" className="text-[var(--color-accent)] hover:underline">{t("backToSignIn")}</Link>
      </p>
    </form>
  )
}
