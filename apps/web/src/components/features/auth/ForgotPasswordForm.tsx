"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import Link from "next/link"
import { api } from "@/lib/trpc/client"

const schema = z.object({ email: z.string().email("Invalid email") })
type FormData = z.infer<typeof schema>

export function ForgotPasswordForm() {
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
          If that email is registered, a reset link has been sent. Check your inbox.
        </p>
        <Link href="/login" className="text-caption text-[var(--color-accent)] hover:underline">
          Back to sign in
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit((data) => forgotPassword.mutate(data))} className="space-y-4">
      <div>
        <label htmlFor="email" className="block text-caption mb-1.5">Email</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          {...register("email")}
          className="w-full px-3 py-2.5 rounded-[var(--radius-md)] bg-[var(--color-surface-0)] text-body-ui border border-[var(--color-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
          placeholder="you@younetgroup.com"
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
        className="w-full h-10 rounded-[var(--radius-pill)] bg-black text-white text-button disabled:opacity-50 hover:opacity-90 transition-opacity"
      >
        {forgotPassword.isPending ? "Sending…" : "Send reset link"}
      </button>

      <p className="text-center text-caption text-[var(--color-text-muted)]">
        <Link href="/login" className="text-[var(--color-accent)] hover:underline">Back to sign in</Link>
      </p>
    </form>
  )
}
