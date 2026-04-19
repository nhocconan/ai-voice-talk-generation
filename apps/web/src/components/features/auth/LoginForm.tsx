"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"

const schema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Required"),
})
type FormData = z.infer<typeof schema>

export function LoginForm() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: FormData) => {
    setLoading(true)
    setError(null)
    try {
      const res = await signIn("credentials", { email: data.email, password: data.password, redirect: false })
      if (res?.error) {
        setError("Invalid email or password")
      } else {
        router.push("/dashboard")
        router.refresh()
      }
    } catch {
      setError("An error occurred. Please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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

      <div>
        <label htmlFor="password" className="block text-caption mb-1.5">Password</label>
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

      <button
        type="submit"
        disabled={loading}
        className="w-full h-10 rounded-[var(--radius-pill)] bg-black text-white text-button disabled:opacity-50 hover:opacity-90 transition-opacity"
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  )
}
