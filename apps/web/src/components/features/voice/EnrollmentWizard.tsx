"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useTranslations } from "next-intl"
import { trpc } from "@/lib/trpc/client"
import { InBrowserRecorder } from "./InBrowserRecorder"
import { AudioUploader } from "./AudioUploader"
import { cn } from "@/lib/utils"
import { getGuidedPrompts } from "./guidedPrompts"

const profileSchema = z.object({
  name: z.string().min(1, "Required").max(100),
  lang: z.enum(["vi", "en", "multi"]),
  consentGiven: z.literal(true, { errorMap: () => ({ message: "Consent is required" }) }),
})
type ProfileFormData = z.infer<typeof profileSchema>

type Mode = "guided" | "upload"
type Step = "info" | "record" | "done"

export function EnrollmentWizard() {
  const t = useTranslations("voices")
  const router = useRouter()
  const [step, setStep] = useState<Step>("info")
  const [mode, setMode] = useState<Mode>("guided")
  const [profileId, setProfileId] = useState<string | null>(null)

  const createProfile = trpc.voiceProfile.create.useMutation()

  const { register, handleSubmit, watch, formState: { errors } } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: { lang: "vi" },
  })
  const selectedLang = watch("lang") ?? "vi"

  const onInfoSubmit = async (data: ProfileFormData) => {
    const profile = await createProfile.mutateAsync({
      name: data.name,
      lang: data.lang,
      consentText: t("consentText"),
    })
    setProfileId(profile.id)
    setStep("record")
  }

  if (step === "info") {
    return (
      <form onSubmit={handleSubmit(onInfoSubmit)} className="space-y-6">
        <div
          className="bg-[var(--color-surface-0)] rounded-[var(--radius-card)] p-6"
          style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
        >
          <h2 className="text-body-med mb-4">{t("profileDetails")}</h2>

          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-caption mb-1.5">{t("profileNameLabel")}</label>
              <input
                id="name"
                {...register("name")}
                placeholder={t("profileNamePlaceholder")}
                className="w-full px-3 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui"
              />
              {errors.name && <p className="text-micro text-[var(--color-danger)] mt-1">{errors.name.message}</p>}
            </div>

            <div>
              <label className="block text-caption mb-1.5">{t("languageLabel")}</label>
              <div className="flex gap-2">
                {(["vi", "en", "multi"] as const).map((lang) => (
                  <label key={lang} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" value={lang} {...register("lang")} className="sr-only" />
                    <span
                      className="px-3 py-1.5 rounded-[var(--radius-pill)] text-caption border border-[var(--color-border)] hover:bg-[var(--color-surface-1)] cursor-pointer transition-colors"
                    >
                      {lang === "vi" ? "Tiếng Việt" : lang === "en" ? "English" : t("langMulti")}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-caption mb-2">{t("recordingModeLabel")}</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(["guided", "upload"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={cn(
                      "cursor-pointer p-4 rounded-[var(--radius-card)] text-left border transition-colors",
                      mode === m
                        ? "border-[var(--color-emphasis)] bg-[var(--color-surface-1)]"
                        : "border-[var(--color-border)] hover:bg-[var(--color-surface-1)]",
                    )}
                  >
                    <div className="text-body-med">{m === "guided" ? t("modeGuidedTitle") : t("modeUploadTitle")}</div>
                    <div className="text-caption text-[var(--color-text-muted)] mt-1">
                      {m === "guided" ? t("modeGuidedDesc") : t("modeUploadDesc")}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Consent */}
            <div className="p-4 bg-[var(--color-surface-1)] rounded-[var(--radius-md)]">
              <p className="text-caption text-[var(--color-text-secondary)] mb-3">{t("consentText")}</p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  {...register("consentGiven")}
                  className="w-4 h-4 rounded"
                />
                <span className="text-caption">{t("consentAgree")}</span>
              </label>
              {errors.consentGiven && <p className="text-micro text-[var(--color-danger)] mt-1">{errors.consentGiven.message}</p>}
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={createProfile.isPending}
          className="h-10 cursor-pointer px-6 rounded-[var(--radius-pill)] bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)] text-button disabled:cursor-not-allowed disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {createProfile.isPending ? t("creating") : t("continue")}
        </button>
      </form>
    )
  }

  if (step === "record" && profileId) {
    return (
      <div className="space-y-6">
        <div
          className="bg-[var(--color-surface-0)] rounded-[var(--radius-card)] p-6"
          style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
        >
          {mode === "guided" ? (
            <InBrowserRecorder
              prompts={getGuidedPrompts(selectedLang)}
              profileId={profileId}
              onComplete={() => setStep("done")}
            />
          ) : (
            <AudioUploader
              profileId={profileId}
              onComplete={() => setStep("done")}
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      className="bg-[var(--color-surface-0)] rounded-[var(--radius-card)] p-8 text-center"
      style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
    >
      <div className="w-12 h-12 rounded-full bg-[var(--color-success)]/10 flex items-center justify-center mx-auto mb-4">
        <span className="text-[var(--color-success)] text-xl">✓</span>
      </div>
      <h2 className="text-display-card mb-2">{t("profileCreated")}</h2>
      <p className="text-body text-[var(--color-text-secondary)] mb-6">
        {t("profileCreatedDesc")}
      </p>
      <div className="flex gap-3 justify-center">
        <button
          onClick={() => profileId && router.push(`/voices/${profileId}`)}
          className="h-10 cursor-pointer px-6 rounded-[var(--radius-pill)] bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)] text-button hover:opacity-90"
        >
          {t("viewProfile")}
        </button>
        <button
          onClick={() => router.push("/voices")}
          className="h-10 cursor-pointer px-6 rounded-[var(--radius-pill)] border border-[var(--color-border)] text-button hover:bg-[var(--color-surface-1)]"
        >
          {t("allProfiles")}
        </button>
      </div>
    </div>
  )
}
