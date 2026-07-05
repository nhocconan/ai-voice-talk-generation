"use client"

import { use, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useRouter } from "next/navigation"
import { signIn } from "next-auth/react"
import { useTranslations } from "next-intl"
import { trpc } from "@/lib/trpc/client"

const schema = z.object({
  name: z.string().min(1, "Required"),
  password: z.string().min(8).regex(/^(?=.*[A-Z])(?=.*[0-9])/, "Must contain uppercase letter and number"),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] })

type FormData = z.infer<typeof schema>

export function AcceptInviteForm({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const t = useTranslations("auth")
  const params = use(searchParams)
  const token = params.token ?? ""
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)

  const { data: tokenData, isLoading: validating } = trpc.invite.validateToken.useQuery({ token }, { enabled: !!token })
  const accept = trpc.invite.accept.useMutation()

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: FormData) => {
    setServerError(null)
    try {
      await accept.mutateAsync({ token, name: data.name, password: data.password })
      const authResult = await signIn("credentials", {
        email: tokenData?.email ?? "",
        password: data.password,
        redirect: false,
      })

      if (authResult?.error) {
        router.push("/login?invited=1")
        return
      }

      router.push("/dashboard")
      router.refresh()
    } catch (e) {
      setServerError(e instanceof Error ? e.message : t("genericError"))
    }
  }

  if (validating) return <p className="text-body-ui text-center">{t("validatingInvite")}</p>
  if (!tokenData?.valid) return (
    <div className="text-center">
      <p className="text-body-ui text-[var(--color-danger)]">{t("inviteInvalid")}</p>
      <p className="text-caption text-[var(--color-text-muted)] mt-2">{t("inviteInvalidHelp")}</p>
    </div>
  )

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <p className="text-caption text-[var(--color-text-muted)] mb-4">
          {t("signingUpAs", { email: tokenData.email ?? "" })}
        </p>
      </div>

      <div>
        <label htmlFor="name" className="block text-caption mb-1.5">{t("fullNameLabel")}</label>
        <input id="name" {...register("name")} className="w-full px-3 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui" />
        {errors.name && <p className="text-micro text-[var(--color-danger)] mt-1">{errors.name.message}</p>}
      </div>

      <div>
        <label htmlFor="password" className="block text-caption mb-1.5">{t("passwordLabel")}</label>
        <input id="password" type="password" {...register("password")} className="w-full px-3 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui" />
        {errors.password && <p className="text-micro text-[var(--color-danger)] mt-1">{errors.password.message}</p>}
      </div>

      <div>
        <label htmlFor="confirmPassword" className="block text-caption mb-1.5">{t("confirmPasswordLabel")}</label>
        <input id="confirmPassword" type="password" {...register("confirmPassword")} className="w-full px-3 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui" />
        {errors.confirmPassword && <p className="text-micro text-[var(--color-danger)] mt-1">{errors.confirmPassword.message}</p>}
      </div>

      {serverError && (
        <div className="text-body-ui text-[var(--color-danger)] bg-[var(--color-accent-soft)] rounded-[var(--radius-md)] px-3 py-2">{serverError}</div>
      )}

      <button type="submit" disabled={accept.isPending} className="w-full h-10 rounded-[var(--radius-pill)] bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)] text-button disabled:opacity-50">
        {accept.isPending ? t("creatingAccount") : t("createAccount")}
      </button>
    </form>
  )
}
