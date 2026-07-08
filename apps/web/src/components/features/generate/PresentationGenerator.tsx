"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useLocale, useTranslations } from "next-intl"
import { trpc } from "@/lib/trpc/client"
import { getProviderMeta } from "@/lib/providers-meta"
import { ProfileSelector } from "./ProfileSelector"
import { ProviderSelector } from "./ProviderSelector"
import { GenerationProgress } from "./GenerationProgress"
import { EstimatedCost } from "./EstimatedCost"
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
  const t = useTranslations("generate")
  const locale = useLocale()
  const [generationId, setGenerationId] = useState<string | null>(null)
  const [showDraft, setShowDraft] = useState(false)
  const [modelKey, setModelKey] = useState("")
  const [draftedBy, setDraftedBy] = useState<string | null>(null)

  const create = trpc.generation.createPresentation.useMutation()
  const draftMutation = trpc.generation.draftScript.useMutation()
  const { data: llmProviders } = trpc.generation.listLlmProviders.useQuery()

  // Flatten enabled LLM providers × their enabled models into "Provider — Model"
  // options. Empty when no LLM provider is configured (draftScript then falls
  // back to env Gemini server-side).
  const llmOptions = useMemo(() => {
    return (llmProviders ?? []).flatMap((p) => {
      const providerLabel = getProviderMeta(p.name, locale)?.shortName ?? p.name
      return p.models.map((m) => ({
        key: `${p.id}::${m.modelId}`,
        providerId: p.id,
        model: m.modelId,
        label: `${providerLabel} — ${m.displayName}`,
        caption: `${providerLabel} · ${m.modelId}`,
        isDefault: p.isDefault && m.isDefault,
      }))
    })
  }, [llmProviders, locale])

  const selectedOption =
    llmOptions.find((o) => o.key === modelKey) ??
    llmOptions.find((o) => o.isDefault) ??
    llmOptions[0]

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
  const estimatedMinutes = watch("estimatedMinutes")

  const onSubmit = async (data: FormData) => {
    const { generationId: id } = await create.mutateAsync(data)
    setGenerationId(id)
  }

  const onDraft = async (data: DraftForm) => {
    const { script } = await draftMutation.mutateAsync({
      ...data,
      ...(selectedOption
        ? { providerId: selectedOption.providerId, model: selectedOption.model }
        : {}),
    })
    setValue("script", script)
    setValue("estimatedMinutes", data.minutes)
    setDraftedBy(selectedOption?.caption ?? null)
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
            <label className="block text-caption mb-2">{t("voiceProfile")}</label>
            <ProfileSelector
              selected={profileId}
              onSelect={(id) => setValue("profileId", id)}
            />
            {errors.profileId && <p className="text-micro text-[var(--color-danger)] mt-1">{errors.profileId.message}</p>}
          </div>

          <div>
            <label htmlFor="estimatedMinutes" className="block text-caption mb-2">
              {t("targetLength")}
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
            description={t("providerCompareHint")}
          />

          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="script" className="block text-caption">{t("script")}</label>
              <button
                type="button"
                onClick={() => setShowDraft(!showDraft)}
                className="flex items-center gap-1.5 text-caption text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
              >
                <SparklesIcon size={12} />
                {t("draftWithAi")}
              </button>
            </div>

            {/* P3-01: Gemini script drafting panel */}
            {showDraft && (
              <div
                className="mb-3 p-4 rounded-[var(--radius-md)] bg-[var(--color-surface-1)]"
                style={{ border: "1px solid var(--color-border)" }}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                  <div className="col-span-2">
                    <label className="block text-micro text-[var(--color-text-muted)] mb-1">{t("topic")}</label>
                    <input
                      {...draftForm.register("topic")}
                      placeholder={t("topicPlaceholder")}
                      className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui text-sm"
                    />
                    {draftForm.formState.errors.topic && (
                      <p className="text-micro text-[var(--color-danger)] mt-1">{draftForm.formState.errors.topic.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-micro text-[var(--color-text-muted)] mb-1">{t("language")}</label>
                    <select {...draftForm.register("lang")} className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui bg-[var(--color-surface-0)]">
                      <option value="vi">Tiếng Việt</option>
                      <option value="en">English</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-micro text-[var(--color-text-muted)] mb-1">{t("tone")}</label>
                    <select {...draftForm.register("tone")} className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui bg-[var(--color-surface-0)]">
                      <option value="professional">{t("toneProfessional")}</option>
                      <option value="conversational">{t("toneConversational")}</option>
                      <option value="educational">{t("toneEducational")}</option>
                      <option value="storytelling">{t("toneStorytelling")}</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label htmlFor="draft-model" className="block text-micro text-[var(--color-text-muted)] mb-1">{t("model")}</label>
                    <select
                      id="draft-model"
                      value={selectedOption?.key ?? ""}
                      onChange={(e) => setModelKey(e.target.value)}
                      disabled={llmOptions.length === 0}
                      className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui bg-[var(--color-surface-0)] disabled:opacity-60"
                    >
                      {llmOptions.length === 0 ? (
                        <option value="">{t("llmFallback")}</option>
                      ) : (
                        llmOptions.map((o) => (
                          <option key={o.key} value={o.key}>
                            {o.label}{o.isDefault ? ` (${t("defaultSuffix")})` : ""}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>
                {draftMutation.error && <p className="text-micro text-[var(--color-danger)] mb-2">{draftMutation.error.message}</p>}
                <button
                  type="button"
                  onClick={draftForm.handleSubmit(onDraft)}
                  disabled={draftMutation.isPending}
                  className="h-8 px-4 rounded-[var(--radius-pill)] bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)] text-button text-sm disabled:opacity-50 hover:opacity-90"
                >
                  {draftMutation.isPending ? t("drafting") : `${t("generateDraft")} →`}
                </button>
              </div>
            )}

            <textarea
              id="script"
              {...register("script")}
              rows={12}
              placeholder={t("scriptPastePlaceholder")}
              className="w-full px-3 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui resize-y"
              style={{ minHeight: "240px" }}
            />
            {errors.script && <p className="text-micro text-[var(--color-danger)] mt-1">{errors.script.message}</p>}
            {draftedBy && !errors.script && (
              <p className="text-micro text-[var(--color-text-muted)] mt-1">{t("draftedBy", { model: draftedBy })}</p>
            )}
          </div>
        </div>
      </div>

      {create.error && (
        <p className="text-body-ui text-[var(--color-danger)]">{create.error.message}</p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="submit"
          disabled={create.isPending}
          className="h-10 px-6 rounded-[var(--radius-pill)] bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)] text-button disabled:opacity-50 hover:opacity-90"
        >
          {create.isPending ? t("queueing") : t("generateAudio")}
        </button>
        <EstimatedCost providerId={providerId} minutes={estimatedMinutes || 0} />
      </div>
    </form>
  )
}
