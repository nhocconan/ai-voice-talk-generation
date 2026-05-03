"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { api } from "@/lib/trpc/client"

const schema = z.object({
  password: z.string()
    .min(8, "At least 8 characters")
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[0-9]/, "Must contain a digit"),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, { message: "Passwords do not match", path: ["confirm"] })

type FormData = z.infer<typeof schema>

export function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token") ?? ""
  const [done, setDone] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const resetPassword = api.auth.resetPassword.useMutation({
    onSuccess: () => {
      setDone(true)
      setTimeout(() => router.push("/login"), 2000)
    },
  })

  if (!token) {
    return (
      <p className="text-body-ui text-[var(--color-danger)]">
        Invalid or missing reset token.{" "}
        <Link href="/forgot-password" className="text-[var(--color-accent)] hover:underline">Request a new one.</Link>
      </p>
    )
  }

  if (done) {
    return (
      <p className="text-body-ui text-[var(--color-text-primary)] text-center">
        Password updated. Redirecting to sign in…
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit((data) => resetPassword.mutate({ token, password: data.password }))} className="space-y-4">
      <div>
        <label htmlFor="password" className="block text-caption mb-1.5">New password</label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          {...register("password")}
          className="w-full px-3 py-2.5 rounded-[var(--radius-md)] bg-[var(--color-surface-0)] text-body-ui border border-[var(--color-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
        />
        {errors.password && <p className="text-micro text-[var(--color-danger)] mt-1">{errors.password.message}</p>}
      </div>

      <div>
        <label htmlFor="confirm" className="block text-caption mb-1.5">Confirm password</label>
        <input
          id="confirm"
          type="password"
          autoComplete="new-password"
          {...register("confirm")}
          className="w-full px-3 py-2.5 rounded-[var(--radius-md)] bg-[var(--color-surface-0)] text-body-ui border border-[var(--color-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"
        />
        {errors.confirm && <p className="text-micro text-[var(--color-danger)] mt-1">{errors.confirm.message}</p>}
      </div>

      {resetPassword.error && (
        <div className="text-body-ui text-[var(--color-danger)] bg-[var(--color-accent-soft)] rounded-[var(--radius-md)] px-3 py-2">
          {resetPassword.error.message}
        </div>
      )}

      <button
        type="submit"
        disabled={resetPassword.isPending}
        className="w-full h-10 rounded-[var(--radius-pill)] bg-black text-white text-button disabled:opacity-50 hover:opacity-90 transition-opacity"
      >
        {resetPassword.isPending ? "Saving…" : "Set new password"}
      </button>
    </form>
  )
}
