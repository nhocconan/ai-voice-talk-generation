"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { trpc } from "@/lib/trpc/client"
import { InBrowserRecorder } from "./InBrowserRecorder"
import { AudioUploader } from "./AudioUploader"
import { cn } from "@/lib/utils"

const profileSchema = z.object({
  name: z.string().min(1, "Required").max(100),
  lang: z.enum(["vi", "en", "multi"]),
  consentGiven: z.literal(true, { errorMap: () => ({ message: "Consent is required" }) }),
})
type ProfileFormData = z.infer<typeof profileSchema>

const CONSENT_TEXT = "I consent to my voice being enrolled in YouNet Voice Studio and used to generate audio content. I understand my voice data is stored securely and can be deleted at any time."
const GUIDED_PROMPTS = [
  "Xin chào, tôi là thành viên của đội ngũ YouNet. Chúng tôi cống hiến để tạo ra những giá trị tốt nhất.",
  "Hello, I'm part of the YouNet team. We are committed to building innovative solutions for our clients.",
  "Công nghệ và con người — đây là hai yếu tố cốt lõi trong mọi điều chúng tôi làm tại YouNet.",
  "At YouNet, we believe that every great idea starts with a single conversation.",
  "Cảm ơn bạn đã lắng nghe. Chúng tôi rất mong được hợp tác cùng bạn trong tương lai gần.",
]

type Mode = "guided" | "upload"
type Step = "info" | "record" | "done"

export function EnrollmentWizard() {
  const router = useRouter()
  const [step, setStep] = useState<Step>("info")
  const [mode, setMode] = useState<Mode>("guided")
  const [profileId, setProfileId] = useState<string | null>(null)

  const createProfile = trpc.voiceProfile.create.useMutation()

  const { register, handleSubmit, formState: { errors } } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
  })

  const onInfoSubmit = async (data: ProfileFormData) => {
    const profile = await createProfile.mutateAsync({
      name: data.name,
      lang: data.lang,
      consentText: CONSENT_TEXT,
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
          <h2 className="text-body-med mb-4">Profile Details</h2>

          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-caption mb-1.5">Profile Name</label>
              <input
                id="name"
                {...register("name")}
                placeholder="e.g., CEO Voice VI"
                className="w-full px-3 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui"
              />
              {errors.name && <p className="text-micro text-[var(--color-danger)] mt-1">{errors.name.message}</p>}
            </div>

            <div>
              <label className="block text-caption mb-1.5">Language</label>
              <div className="flex gap-2">
                {(["vi", "en", "multi"] as const).map((lang) => (
                  <label key={lang} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" value={lang} {...register("lang")} className="sr-only" />
                    <span
                      className="px-3 py-1.5 rounded-[var(--radius-pill)] text-caption border border-[var(--color-border)] hover:bg-[var(--color-surface-1)] cursor-pointer transition-colors"
                    >
                      {lang === "vi" ? "Tiếng Việt" : lang === "en" ? "English" : "Multi"}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-caption mb-2">Recording Mode</label>
              <div className="grid grid-cols-2 gap-3">
                {(["guided", "upload"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={cn(
                      "p-4 rounded-[var(--radius-card)] text-left border transition-colors",
                      mode === m
                        ? "border-black bg-[var(--color-surface-1)]"
                        : "border-[var(--color-border)] hover:bg-[var(--color-surface-1)]",
                    )}
                  >
                    <div className="text-body-med">{m === "guided" ? "Guided Recording" : "Upload Files"}</div>
                    <div className="text-caption text-[var(--color-text-muted)] mt-1">
                      {m === "guided" ? "Record 3–5 prompts in-browser" : "Upload mp3, m4a, or wav"}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Consent */}
            <div className="p-4 bg-[var(--color-surface-1)] rounded-[var(--radius-md)]">
              <p className="text-caption text-[var(--color-text-secondary)] mb-3">{CONSENT_TEXT}</p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  {...register("consentGiven")}
                  className="w-4 h-4 rounded"
                />
                <span className="text-caption">I agree to the above</span>
              </label>
              {errors.consentGiven && <p className="text-micro text-[var(--color-danger)] mt-1">{errors.consentGiven.message}</p>}
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={createProfile.isPending}
          className="h-10 px-6 rounded-[var(--radius-pill)] bg-black text-white text-button disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          {createProfile.isPending ? "Creating…" : "Continue →"}
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
              prompts={GUIDED_PROMPTS}
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
      <h2 className="text-display-card mb-2">Profile created</h2>
      <p className="text-body text-[var(--color-text-secondary)] mb-6">
        Your voice samples are being processed. Quality scores will appear shortly.
      </p>
      <div className="flex gap-3 justify-center">
        <button
          onClick={() => profileId && router.push(`/voices/${profileId}`)}
          className="h-10 px-6 rounded-[var(--radius-pill)] bg-black text-white text-button hover:opacity-90"
        >
          View Profile
        </button>
        <button
          onClick={() => router.push("/voices")}
          className="h-10 px-6 rounded-[var(--radius-pill)] border border-[var(--color-border)] text-button hover:bg-[var(--color-surface-1)]"
        >
          All Profiles
        </button>
      </div>
    </div>
  )
}
