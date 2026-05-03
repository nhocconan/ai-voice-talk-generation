"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { trpc } from "@/lib/trpc/client"
import { ProfileSelector } from "./ProfileSelector"
import { ProviderSelector } from "./ProviderSelector"
import { GenerationProgress } from "./GenerationProgress"
import { SparklesIcon } from "lucide-react"

const schema = z.object({
  profileId: z.string().min(1, "Select a voice profile"),
  script: z.string().min(10, "Script too short").max(500000),
  estimatedMinutes: z.coerce.number().min(0.1).max(60),
  providerId: z.string().optional(),
})
type FormData = z.infer<typeof schema>

const draftSchema = z.object({
  topic: z.string().min(3, "Topic too short"),
  minutes: z.coerce.number().min(0.5).max(30),
  tone: z.enum(["professional", "conversational", "educational", "storytelling"]),
  lang: z.enum(["vi", "en"]),
})
type DraftForm = z.infer<typeof draftSchema>

export function PresentationGenerator() {
  const router = useRouter()
  const [generationId, setGenerationId] = useState<string | null>(null)
  const [showDraft, setShowDraft] = useState(false)

  const create = trpc.generation.createPresentation.useMutation()
  const draftMutation = trpc.generation.draftScript.useMutation()

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { estimatedMinutes: 5, providerId: "" },
  })

  const draftForm = useForm<DraftForm>({
    resolver: zodResolver(draftSchema),
    defaultValues: { tone: "professional", lang: "vi", minutes: 5 },
  })

  const profileId = watch("profileId")
  const providerId = watch("providerId")

  const onSubmit = async (data: FormData) => {
    const { generationId: id } = await create.mutateAsync(data)
    setGenerationId(id)
  }

  const onDraft = async (data: DraftForm) => {
    const { script } = await draftMutation.mutateAsync(data)
    setValue("script", script)
    setValue("estimatedMinutes", data.minutes)
    setShowDraft(false)
  }

  if (generationId) {
    return <GenerationProgress generationId={generationId} onDone={() => router.push(`/history/${generationId}`)} />
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div
        className="bg-[var(--color-surface-0)] rounded-[var(--radius-card)] p-6"
        style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
      >
        <div className="space-y-5">
          <div>
            <label className="block text-caption mb-2">Voice Profile</label>
            <ProfileSelector
              selected={profileId}
              onSelect={(id) => setValue("profileId", id)}
            />
            {errors.profileId && <p className="text-micro text-[var(--color-danger)] mt-1">{errors.profileId.message}</p>}
          </div>

          <div>
            <label htmlFor="estimatedMinutes" className="block text-caption mb-2">
              Target Length (minutes)
            </label>
            <input
              id="estimatedMinutes"
              type="number"
              step="0.5"
              min="0.5"
              max="60"
              {...register("estimatedMinutes")}
              className="w-32 px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui"
            />
          </div>

          <ProviderSelector
            value={providerId ?? ""}
            onChange={(id) => setValue("providerId", id)}
            description="Pick a provider per render when you want to compare VieNeu-TTS, VoxCPM2, or a cloud fallback."
          />

          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="script" className="block text-caption">Script</label>
              <button
                type="button"
                onClick={() => setShowDraft(!showDraft)}
                className="flex items-center gap-1.5 text-caption text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                <SparklesIcon size={12} />
                Draft with Gemini
              </button>
            </div>

            {/* P3-01: Gemini script drafting panel */}
            {showDraft && (
              <div
                className="mb-3 p-4 rounded-[var(--radius-md)] bg-[var(--color-surface-1)]"
                style={{ border: "1px solid var(--color-border)" }}
              >
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="col-span-2">
                    <label className="block text-micro text-[var(--color-text-muted)] mb-1">Topic</label>
                    <input
                      {...draftForm.register("topic")}
                      placeholder="e.g. Introduction to AI at YouNet"
                      className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui text-sm"
                    />
                    {draftForm.formState.errors.topic && (
                      <p className="text-micro text-[var(--color-danger)] mt-1">{draftForm.formState.errors.topic.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-micro text-[var(--color-text-muted)] mb-1">Language</label>
                    <select {...draftForm.register("lang")} className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui bg-white">
                      <option value="vi">Tiếng Việt</option>
                      <option value="en">English</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-micro text-[var(--color-text-muted)] mb-1">Tone</label>
                    <select {...draftForm.register("tone")} className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui bg-white">
                      <option value="professional">Professional</option>
                      <option value="conversational">Conversational</option>
                      <option value="educational">Educational</option>
                      <option value="storytelling">Storytelling</option>
                    </select>
                  </div>
                </div>
                {draftMutation.error && <p className="text-micro text-[var(--color-danger)] mb-2">{draftMutation.error.message}</p>}
                <button
                  type="button"
                  onClick={draftForm.handleSubmit(onDraft)}
                  disabled={draftMutation.isPending}
                  className="h-8 px-4 rounded-[var(--radius-pill)] bg-black text-white text-button text-sm disabled:opacity-50 hover:opacity-90"
                >
                  {draftMutation.isPending ? "Drafting…" : "Generate Draft →"}
                </button>
              </div>
            )}

            <textarea
              id="script"
              {...register("script")}
              rows={12}
              placeholder="Paste or type your script here…"
              className="w-full px-3 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui resize-y"
              style={{ minHeight: "240px" }}
            />
            {errors.script && <p className="text-micro text-[var(--color-danger)] mt-1">{errors.script.message}</p>}
          </div>
        </div>
      </div>

      {create.error && (
        <p className="text-body-ui text-[var(--color-danger)]">{create.error.message}</p>
      )}

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={create.isPending}
          className="h-10 px-6 rounded-[var(--radius-pill)] bg-black text-white text-button disabled:opacity-50 hover:opacity-90"
        >
          {create.isPending ? "Queueing…" : "Generate Audio"}
        </button>
      </div>
    </form>
  )
}
