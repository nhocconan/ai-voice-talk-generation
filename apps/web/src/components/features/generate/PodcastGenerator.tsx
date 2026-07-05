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
  const [generationId, setGenerationId] = useState<string | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)

  const utils = trpc.useUtils()
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
          />
        </div>
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{t("speakerB")}</h2>
          <ProfileSelector
            value={profileBId}
            onChange={setProfileBId}
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
