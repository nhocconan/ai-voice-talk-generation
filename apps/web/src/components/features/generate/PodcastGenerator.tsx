"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { trpc } from "@/lib/trpc/client"
import { parseTimedScript } from "@/lib/timed-script"
import { ProfileSelector } from "./ProfileSelector"
import { ProviderSelector } from "./ProviderSelector"
import { GenerationProgress } from "./GenerationProgress"
import { EstimatedCost } from "./EstimatedCost"

const DEFAULT_SCRIPT = `[00:00 A] Xin chào và chào mừng đến với bản tin hôm nay.\n[00:08 B] Cảm ơn bạn. Chúng ta sẽ bắt đầu với các cập nhật mới nhất.`

export function PodcastGenerator() {
  const t = useTranslations("generate")
  const [profileAId, setProfileAId] = useState("")
  const [profileBId, setProfileBId] = useState("")
  const [providerId, setProviderId] = useState("")
  const [script, setScript] = useState(DEFAULT_SCRIPT)
  const [audiogram, setAudiogram] = useState(false)
  const [audiogramTitle, setAudiogramTitle] = useState("")
  const [audiogramAspect, setAudiogramAspect] = useState<"1:1" | "9:16" | "16:9">("1:1")
  const [audiogramTheme, setAudiogramTheme] = useState<"dark" | "midnight" | "forest" | "sunset" | "brand" | "slate">("dark")

  const podcastThemes = [
    { id: "dark" as const, swatch: "#0B0B0F", accent: "#7FFFFF" },
    { id: "midnight" as const, swatch: "#0A1628", accent: "#60A5FA" },
    { id: "forest" as const, swatch: "#0C1F17", accent: "#4ADE80" },
    { id: "sunset" as const, swatch: "#1A0F14", accent: "#FB923C" },
    { id: "brand" as const, swatch: "#1A0508", accent: "#E5001A" },
    { id: "slate" as const, swatch: "#111827", accent: "#A78BFA" },
  ]
  const [generationId, setGenerationId] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)

  const utils = trpc.useUtils()
  const { data: ttsProviders } = trpc.generation.listAvailableProviders.useQuery()
  const mutation = trpc.generation.createPodcast.useMutation({
    onSuccess: (data) => {
      setGenerationId(data.generationId)
      void utils.generation.list.invalidate()
    },
  })

  const estimatedMinutes = useMemo(() => {
    const segments = parseTimedScript(script)
    const lastEndMs = segments.at(-1)?.endMs ?? 30_000
    return Math.max(0.5, Math.min(60, lastEndMs / 60_000))
  }, [script])
  const selectedTtsProvider =
    (providerId ? ttsProviders?.find((provider) => provider.id === providerId) : ttsProviders?.find((provider) => provider.isDefault)) ??
    ttsProviders?.[0]
  const requiredProviderVoiceId = selectedTtsProvider?.name === "XAI_TTS" ? "XAI_TTS" : undefined

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      const segments = parseTimedScript(script)
      setParseError(null)

      const speakers = (["A", "B"] as const)
        .map((label) => ({
          label,
          profileId: label === "A" ? profileAId : (profileBId || profileAId),
          segments: segments
            .filter((segment) => segment.label === label)
            .map(({ startMs, endMs, text }) => ({ startMs, endMs, text })),
        }))
        .filter((speaker) => speaker.profileId && speaker.segments.length > 0)

      mutation.mutate({
        estimatedMinutes,
        providerId: providerId || undefined,
        speakers,
        audiogram,
        audiogramTitle: audiogramTitle.trim() || undefined,
        audiogramAspect,
        audiogramTheme,
      })
    } catch (error) {
      setParseError(error instanceof Error ? error.message : t("invalidTimedScript"))
    }
  }

  if (generationId) {
    return (
      <GenerationProgress
        generationId={generationId}
        onReset={() => setGenerationId(null)}
      />
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{t("speakerA")}</h2>
          <ProfileSelector
            value={profileAId}
            onChange={setProfileAId}
            requireProviderVoiceId={requiredProviderVoiceId}
          />
        </div>
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{t("speakerB")}</h2>
          <ProfileSelector
            value={profileBId}
            onChange={setProfileBId}
            requireProviderVoiceId={requiredProviderVoiceId}
          />
          <p className="text-xs text-[var(--color-text-tertiary)]">
            {t("reuseSpeakerA")}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        <ProviderSelector
          value={providerId}
          onChange={setProviderId}
          description={t("providerOverrideHint")}
        />
      </div>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{t("timedScript")}</h2>
        <textarea
          value={script}
          onChange={(event) => setScript(event.target.value)}
          rows={10}
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
        />
        <p className="text-xs text-[var(--color-text-tertiary)]">
          {t("timedScriptFormatHint")}
        </p>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5 space-y-3">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{t("audiogramSection")}</h2>
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={audiogram}
            onChange={(event) => setAudiogram(event.target.checked)}
            className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-accent)]"
          />
          <span className="text-sm text-[var(--color-text-primary)]">{t("audiogramToggle")}</span>
        </label>
        <p className="text-xs text-[var(--color-text-tertiary)]">{t("audiogramHint")}</p>

        {audiogram && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="podcast-audiogram-title" className="block text-xs text-[var(--color-text-secondary)] mb-1">
                  {t("audiogramTitle")}
                </label>
                <input
                  id="podcast-audiogram-title"
                  value={audiogramTitle}
                  onChange={(event) => setAudiogramTitle(event.target.value)}
                  maxLength={120}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label htmlFor="podcast-audiogram-aspect" className="block text-xs text-[var(--color-text-secondary)] mb-1">
                  {t("audiogramAspect")}
                </label>
                <select
                  id="podcast-audiogram-aspect"
                  value={audiogramAspect}
                  onChange={(event) => setAudiogramAspect(event.target.value as "1:1" | "9:16" | "16:9")}
                  className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2 text-sm cursor-pointer"
                >
                  <option value="1:1">{t("audiogramAspectSquare")}</option>
                  <option value="9:16">{t("audiogramAspectVertical")}</option>
                  <option value="16:9">{t("audiogramAspectWide")}</option>
                </select>
              </div>
            </div>
            <div>
              <p className="block text-xs text-[var(--color-text-secondary)] mb-2">{t("audiogramTheme")}</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {podcastThemes.map((theme) => {
                  const selected = audiogramTheme === theme.id
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => setAudiogramTheme(theme.id)}
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
                      <span className="text-sm text-[var(--color-text-primary)]">
                        {t(`audiogramTheme_${theme.id}`)}
                      </span>
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-2">{t("audiogramCaptionsHint")}</p>
            </div>
          </div>
        )}
      </div>

      {parseError && <p className="text-sm text-[var(--color-danger)]">{parseError}</p>}
      {mutation.error && <p className="text-sm text-[var(--color-danger)]">{mutation.error.message}</p>}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="submit"
          disabled={mutation.isPending || !profileAId || !script.trim()}
          className="rounded-[var(--radius-warm-btn)] bg-[var(--color-accent)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          {mutation.isPending ? t("generating") : `${t("generatePodcast")} (${estimatedMinutes.toFixed(1)} ${t("minShort")})`}
        </button>
        <EstimatedCost providerId={providerId} minutes={estimatedMinutes} />
      </div>
    </form>
  )
}
