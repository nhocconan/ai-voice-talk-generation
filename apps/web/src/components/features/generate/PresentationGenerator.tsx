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
  xaiVoiceId: z.string().trim().max(200).optional(),
  audiogram: z.boolean(),
  audiogramTitle: z.string().trim().max(120).optional(),
  audiogramAspect: z.enum(["1:1", "9:16", "16:9"]),
  audiogramTheme: z.enum(["dark", "midnight", "forest", "sunset", "brand", "slate"]),
})
type FormData = z.infer<typeof schema>

const AUDIOGRAM_THEMES = [
  { id: "dark" as const, swatch: "#0B0B0F", accent: "#7FFFFF" },
  { id: "midnight" as const, swatch: "#0A1628", accent: "#60A5FA" },
  { id: "forest" as const, swatch: "#0C1F17", accent: "#4ADE80" },
  { id: "sunset" as const, swatch: "#1A0F14", accent: "#FB923C" },
  { id: "brand" as const, swatch: "#1A0508", accent: "#E5001A" },
  { id: "slate" as const, swatch: "#111827", accent: "#A78BFA" },
]

const draftSchema = z.object({
  topic: z.string().min(3, "Topic too short"),
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
  const { data: ttsProviders } = trpc.generation.listAvailableProviders.useQuery()

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
    defaultValues: {
      estimatedMinutes: 5,
      providerId: "",
      xaiVoiceId: "",
      audiogram: false,
      audiogramTitle: "",
      audiogramAspect: "1:1",
      audiogramTheme: "dark",
    },
  })

  const draftForm = useForm<DraftForm>({
    resolver: zodResolver(draftSchema),
    defaultValues: { tone: "professional", lang: "vi" },
  })

  const profileId = watch("profileId")
  const providerId = watch("providerId")
  const estimatedMinutes = watch("estimatedMinutes")
  const audiogram = watch("audiogram")
  const audiogramTheme = watch("audiogramTheme")
  const selectedTtsProvider =
    (providerId ? ttsProviders?.find((provider) => provider.id === providerId) : ttsProviders?.find((provider) => provider.isDefault)) ??
    ttsProviders?.[0]
  const showVoiceIdOverride = selectedTtsProvider?.name === "XAI_TTS" || selectedTtsProvider?.name === "MINIMAX_TTS"

  const onSubmit = async (data: FormData) => {
    try {
      const trimmedVoiceId = data.xaiVoiceId?.trim()
      const { generationId: id } = await create.mutateAsync({
        ...data,
        // Empty string from the select must not override the server default.
        providerId: data.providerId === "" ? undefined : data.providerId,
        // Empty / whitespace-only voice override must not be sent.
        xaiVoiceId: trimmedVoiceId !== undefined && trimmedVoiceId !== "" ? trimmedVoiceId : undefined,
      })
      setGenerationId(id)
    } catch {
      // Error is surfaced via create.error below — do not swallow silently.
    }
  }

  const onInvalid = () => {
    // Scroll first field error into view so "nothing happens" is never silent.
    const first = document.querySelector<HTMLElement>("[aria-invalid=true], .text-\\[var\\(--color-danger\\)\\]")
    first?.scrollIntoView({ behavior: "smooth", block: "center" })
  }

  const onDraft = async (data: DraftForm) => {
    const minutes = z.coerce.number().min(0.5).max(30).parse(estimatedMinutes)
    const { script } = await draftMutation.mutateAsync({
      ...data,
      minutes,
      ...(selectedOption
        ? { providerId: selectedOption.providerId, model: selectedOption.model }
        : {}),
    })
    setValue("script", script)
    setValue("estimatedMinutes", minutes)
    setDraftedBy(selectedOption?.caption ?? null)
    setShowDraft(false)
  }

  if (generationId) {
    return <GenerationProgress generationId={generationId} onDone={() => router.push(`/history/${generationId}`)} />
  }

  return (
    <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-6">
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
              step="any"
              min="0.5"
              max="60"
              inputMode="decimal"
              {...register("estimatedMinutes", { valueAsNumber: true })}
              className="w-32 px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui"
            />
          </div>

          <ProviderSelector
            value={providerId ?? ""}
            onChange={(id) => setValue("providerId", id)}
            description={t("providerCompareHint")}
          />

          {showVoiceIdOverride && (
            <div>
              <label htmlFor="xaiVoiceId" className="block text-caption mb-2">
                {t("voiceIdOverride")}
              </label>
              <input
                id="xaiVoiceId"
                {...register("xaiVoiceId")}
                placeholder="voice_..."
                className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui font-mono"
              />
              <p className="text-micro text-[var(--color-text-muted)] mt-1">{t("voiceIdOverrideHint")}</p>
            </div>
          )}

          <div>
            <p className="text-caption mb-2">{t("audiogramSection")}</p>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input type="checkbox" {...register("audiogram")} className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-accent)]" />
              <span className="text-body-ui">{t("audiogramToggle")}</span>
            </label>
            <p className="text-micro text-[var(--color-text-muted)] mt-1">{t("audiogramHint")}</p>

            {audiogram && (
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="audiogramTitle" className="block text-micro text-[var(--color-text-muted)] mb-1">
                      {t("audiogramTitle")}
                    </label>
                    <input
                      id="audiogramTitle"
                      {...register("audiogramTitle")}
                      maxLength={120}
                      className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="audiogramAspect" className="block text-micro text-[var(--color-text-muted)] mb-1">
                      {t("audiogramAspect")}
                    </label>
                    <select
                      id="audiogramAspect"
                      {...register("audiogramAspect")}
                      className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui bg-[var(--color-surface-0)] cursor-pointer"
                    >
                      <option value="1:1">{t("audiogramAspectSquare")}</option>
                      <option value="9:16">{t("audiogramAspectVertical")}</option>
                      <option value="16:9">{t("audiogramAspectWide")}</option>
                    </select>
                  </div>
                </div>
                <div>
                  <p className="block text-micro text-[var(--color-text-muted)] mb-2">{t("audiogramTheme")}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {AUDIOGRAM_THEMES.map((theme) => {
                      const selected = audiogramTheme === theme.id
                      return (
                        <button
                          key={theme.id}
                          type="button"
                          onClick={() => setValue("audiogramTheme", theme.id)}
                          className={`flex items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-left text-sm cursor-pointer transition-colors ${
                            selected
                              ? "border-[var(--color-emphasis)] bg-[var(--color-surface-1)]"
                              : "border-[var(--color-border)] hover:bg-[var(--color-surface-1)]"
                          }`}
                        >
                          <span
                            className="h-8 w-8 shrink-0 rounded-md border border-white/10"
                            style={{
                              background: `linear-gradient(135deg, ${theme.swatch} 55%, ${theme.accent} 100%)`,
                            }}
                            aria-hidden
                          />
                          <span className="text-body-ui text-[var(--color-text-primary)]">
                            {t(`audiogramTheme_${theme.id}`)}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-micro text-[var(--color-text-muted)] mt-2">{t("audiogramCaptionsHint")}</p>
                </div>
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="script" className="block text-caption">{t("script")}</label>
              <button
                type="button"
                onClick={() => setShowDraft(!showDraft)}
                className="flex items-center gap-1.5 text-caption text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer transition-colors"
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
                  className="h-8 px-4 rounded-[var(--radius-pill)] bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)] text-button text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:opacity-90"
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

      {(errors.profileId ?? errors.script) && (
        <p className="text-body-ui text-[var(--color-danger)]" role="alert">
          {errors.profileId?.message ?? errors.script?.message}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="submit"
          disabled={create.isPending || draftMutation.isPending}
          className="h-10 px-6 rounded-[var(--radius-pill)] bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)] text-button disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:opacity-90"
        >
          {create.isPending ? t("queueing") : t("generateAudio")}
        </button>
        <EstimatedCost providerId={providerId} minutes={estimatedMinutes} />
      </div>
    </form>
  )
}
