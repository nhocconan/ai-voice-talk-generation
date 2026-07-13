"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { Loader2Icon, CheckCircleIcon, AlertTriangleIcon } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { parseTimedScript } from "@/lib/timed-script"
import { ProfileSelector } from "./ProfileSelector"
import { ProviderSelector } from "./ProviderSelector"
import { GenerationProgress } from "./GenerationProgress"
import { EstimatedCost } from "./EstimatedCost"

type AsrStatus = "idle" | "transcribing" | "done" | "failed"

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0")
  const seconds = (totalSeconds % 60).toString().padStart(2, "0")
  return `${minutes}:${seconds}`
}

// Defensively parses the ASR worker's `inputScript` JSON (array of
// { startMs, endMs, speaker, text }) into `[MM:SS A] text` lines. Returns
// null if the payload isn't ASR segment JSON (e.g. a plain script string).
function formatAsrScript(inputScript: string | null | undefined): string | null {
  if (!inputScript) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(inputScript)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null

  const lines: string[] = []
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue
    const record = item as Record<string, unknown>
    const startMs = record["startMs"]
    const rawText = record["text"]
    if (typeof startMs !== "number" || typeof rawText !== "string") continue

    const text = rawText.trim()
    if (!text) continue

    const rawSpeaker = record["speaker"]
    const speaker = rawSpeaker === "B" || rawSpeaker === "C" ? "B" : "A"
    lines.push(`[${formatMs(startMs)} ${speaker}] ${text}`)
  }

  return lines.length > 0 ? lines.join("\n") : null
}

export function RevoiceGenerator() {
  const t = useTranslations("generate")
  const [fileName, setFileName] = useState<string | null>(null)
  const [storageKey, setStorageKey] = useState("")
  const [uploading, setUploading] = useState(false)
  const [profileAId, setProfileAId] = useState("")
  const [profileBId, setProfileBId] = useState("")
  const [keepSpeakerA, setKeepSpeakerA] = useState(false)
  const [keepSpeakerB, setKeepSpeakerB] = useState(false)
  const [providerId, setProviderId] = useState("")
  const [audiogram, setAudiogram] = useState(false)
  const [audiogramTitle, setAudiogramTitle] = useState("")
  const [audiogramAspect, setAudiogramAspect] = useState<"1:1" | "9:16" | "16:9">("1:1")
  const [audiogramTheme, setAudiogramTheme] = useState<"dark" | "midnight" | "forest" | "sunset" | "brand" | "slate">("dark")
  const [script, setScript] = useState("")
  const [parseError, setParseError] = useState<string | null>(null)
  const [generationId, setGenerationId] = useState<string | null>(null)
  const [asrGenerationId, setAsrGenerationId] = useState<string | null>(null)
  const [asrStatus, setAsrStatus] = useState<AsrStatus>("idle")
  const [asrError, setAsrError] = useState<string | null>(null)
  const [autoScript, setAutoScript] = useState<string | null>(null)
  const [expectedSpeakers, setExpectedSpeakers] = useState<1 | 2>(2)
  const fileRef = useRef<HTMLInputElement>(null)

  const uploadMutation = trpc.generation.requestSourceUploadUrl.useMutation()
  const { data: ttsProviders } = trpc.generation.listAvailableProviders.useQuery()
  const revoiceMutation = trpc.generation.submitRevoice.useMutation({
    onSuccess: (data) => setGenerationId(data.generationId),
  })
  const asrMutation = trpc.generation.submitAsr.useMutation()

  const { data: asrGen } = trpc.generation.get.useQuery(
    { id: asrGenerationId ?? "" },
    {
      enabled: Boolean(asrGenerationId),
      refetchInterval: (q) => {
        const status = q.state.data?.status
        if (status === "DONE" || status === "FAILED" || status === "CANCELLED") return false
        return 2000
      },
    },
  )

  async function startAsr(sourceAudioKey: string, speakerCount = expectedSpeakers) {
    setAsrStatus("transcribing")
    setAsrError(null)
    setAutoScript(null)
    try {
      const { generationId: nextAsrGenerationId } = await asrMutation.mutateAsync({
        sourceAudioKey,
        expectedSpeakers: speakerCount,
      })
      setAsrGenerationId(nextAsrGenerationId)
    } catch (error) {
      setAsrStatus("failed")
      setAsrError(error instanceof Error ? error.message : t("autoTranscribeFailed"))
    }
  }

  useEffect(() => {
    if (!asrGen || asrGen.id !== asrGenerationId) return

    if (asrGen.status === "DONE") {
      const formatted = formatAsrScript(asrGen.inputScript)
      if (!formatted) {
        setAsrStatus("failed")
        setAsrError(t("autoTranscribeEmpty"))
        return
      }
      setAsrStatus("done")
      setAutoScript(formatted)
      setScript((prev) => (prev.trim() === "" ? formatted : prev))
    } else if (asrGen.status === "FAILED" || asrGen.status === "CANCELLED") {
      setAsrStatus("failed")
      setAsrError(asrGen.errorMessage ?? t("autoTranscribeFailed"))
    } else {
      setAsrStatus("transcribing")
    }
  }, [asrGen, asrGenerationId, t])

  const estimatedMinutes = useMemo(() => {
    if (!script.trim()) return 0.5

    try {
      const lastEndMs = parseTimedScript(script).at(-1)?.endMs ?? 30_000
      return Math.max(0.5, Math.min(60, lastEndMs / 60_000))
    } catch {
      return 0.5
    }
  }, [script])
  const scriptSpeakerLabels = useMemo(() => {
    try {
      return new Set(parseTimedScript(script).map((segment) => segment.label))
    } catch {
      return new Set<"A" | "B">()
    }
  }, [script])
  const hasSpeakerA = scriptSpeakerLabels.has("A")
  const hasSpeakerB = scriptSpeakerLabels.has("B")
  const selectedTtsProvider =
    (providerId ? ttsProviders?.find((provider) => provider.id === providerId) : ttsProviders?.find((provider) => provider.isDefault)) ??
    ttsProviders?.[0]
  const requiredProviderVoiceId = selectedTtsProvider?.name === "XAI_TTS" ? "XAI_TTS" : undefined

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setUploading(true)
    setFileName(file.name)
    setStorageKey("")
    setAsrGenerationId(null)
    setAsrStatus("idle")
    setAsrError(null)
    setAutoScript(null)

    try {
      const { uploadUrl, storageKey: nextStorageKey } = await uploadMutation.mutateAsync({
        filename: file.name,
        contentType: file.type || "audio/mpeg",
        contentLength: file.size,
      })

      await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "audio/mpeg" },
      })

      setStorageKey(nextStorageKey)
      void startAsr(nextStorageKey)
    } finally {
      setUploading(false)
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    try {
      const segments = parseTimedScript(script)
      setParseError(null)

      const speakers = (["A", "B"] as const)
        .map((label) => ({
          label,
          keepOriginal: label === "A" ? keepSpeakerA : keepSpeakerB,
          profileId: label === "A"
            ? (keepSpeakerA ? undefined : profileAId)
            : (keepSpeakerB ? undefined : (profileBId || profileAId)),
          segments: segments
            .filter((segment) => segment.label === label)
            .map(({ startMs, endMs, text }) => ({ startMs, endMs, text })),
        }))
        .filter((speaker) => speaker.segments.length > 0)

      revoiceMutation.mutate({
        sourceAudioKey: storageKey,
        estimatedMinutes,
        providerId: providerId || undefined,
        speakers,
        audiogram,
        audiogramTitle: audiogramTitle.trim() === "" ? undefined : audiogramTitle.trim(),
        audiogramAspect,
        audiogramTheme,
      })
    } catch (error) {
      setParseError(error instanceof Error ? error.message : t("invalidTimedScript"))
    }
  }

  if (generationId) {
    return <GenerationProgress generationId={generationId} onReset={() => setGenerationId(null)} />
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5 space-y-4">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">1. {t("uploadSourceAudio")}</h2>
        <fieldset className="flex flex-wrap gap-4">
          <legend className="mb-2 text-xs text-[var(--color-text-secondary)]">{t("sourceSpeakerCount")}</legend>
          {([1, 2] as const).map((count) => (
            <label key={count} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="source-speaker-count"
                checked={expectedSpeakers === count}
                onChange={() => {
                  setExpectedSpeakers(count)
                  if (storageKey) void startAsr(storageKey, count)
                }}
              />
              {t("speakerCount", { count })}
            </label>
          ))}
        </fieldset>
        <div
          onClick={() => fileRef.current?.click()}
          className="flex cursor-pointer flex-col items-center rounded-[var(--radius-md)] border-2 border-dashed border-[var(--color-border)] p-8 text-center hover:border-[var(--color-accent)] transition-colors"
        >
          {fileName ? (
            <p className="text-sm text-[var(--color-text-primary)]">{fileName}</p>
          ) : (
            <>
              <p className="text-sm text-[var(--color-text-secondary)]">{t("clickUploadAudio")}</p>
              <p className="mt-1 text-xs text-[var(--color-text-tertiary)]">{t("maxSize100")}</p>
            </>
          )}
          {uploading && <p className="mt-2 text-xs text-[var(--color-accent)]">{t("uploading")}</p>}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="audio/mpeg,audio/mp4,audio/x-m4a,.mp3,.m4a"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">2. {t("speakerA")}</h2>
          <SpeakerModeToggle keepOriginal={keepSpeakerA} onChange={setKeepSpeakerA} t={t} name="speaker-a-mode" />
          {!keepSpeakerA && (
            <ProfileSelector value={profileAId} onChange={setProfileAId} requireProviderVoiceId={requiredProviderVoiceId} />
          )}
        </div>
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5 space-y-4">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">3. {t("speakerB")}</h2>
          <SpeakerModeToggle keepOriginal={keepSpeakerB} onChange={setKeepSpeakerB} t={t} name="speaker-b-mode" />
          {!keepSpeakerB && (
            <ProfileSelector value={profileBId} onChange={setProfileBId} requireProviderVoiceId={requiredProviderVoiceId} />
          )}
        </div>
      </div>

      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-5 space-y-3">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{t("audiogramSection")}</h2>
        <label className="flex cursor-pointer items-center gap-3">
          <input type="checkbox" checked={audiogram} onChange={(event) => setAudiogram(event.target.checked)} className="h-4 w-4" />
          <span className="text-sm">{t("audiogramToggle")}</span>
        </label>
        <p className="text-xs text-[var(--color-text-tertiary)]">{t("audiogramHint")}</p>
        {audiogram && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="revoice-audiogram-title" className="mb-1 block text-xs">{t("audiogramTitle")}</label>
              <input id="revoice-audiogram-title" value={audiogramTitle} onChange={(event) => setAudiogramTitle(event.target.value)} maxLength={120} className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2 text-sm" />
            </div>
            <div>
              <label htmlFor="revoice-audiogram-aspect" className="mb-1 block text-xs">{t("audiogramAspect")}</label>
              <select id="revoice-audiogram-aspect" value={audiogramAspect} onChange={(event) => setAudiogramAspect(event.target.value as "1:1" | "9:16" | "16:9")} className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2 text-sm">
                <option value="1:1">{t("audiogramAspectSquare")}</option>
                <option value="9:16">{t("audiogramAspectVertical")}</option>
                <option value="16:9">{t("audiogramAspectWide")}</option>
              </select>
            </div>
            <div>
              <label htmlFor="revoice-audiogram-theme" className="mb-1 block text-xs">{t("audiogramTheme")}</label>
              <select id="revoice-audiogram-theme" value={audiogramTheme} onChange={(event) => setAudiogramTheme(event.target.value as typeof audiogramTheme)} className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2 text-sm">
                {(["dark", "midnight", "forest", "sunset", "brand", "slate"] as const).map((theme) => <option key={theme} value={theme}>{t(`audiogramTheme_${theme}`)}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <ProviderSelector
          value={providerId}
          onChange={setProviderId}
          description={t("revoiceProviderHint")}
        />
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">4. {t("revoiceReviewScriptHeading")}</h2>
          {asrStatus === "transcribing" && (
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-accent)]">
              <Loader2Icon size={14} className="animate-spin" aria-hidden />
              {t("autoTranscribing")}
            </span>
          )}
          {asrStatus === "done" && (
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-success)]">
              <CheckCircleIcon size={14} aria-hidden />
              {t("autoTranscribeReady")}
            </span>
          )}
          {asrStatus === "failed" && (
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-danger)]">
              <AlertTriangleIcon size={14} aria-hidden />
              {t("autoTranscribeFailedHint")}
            </span>
          )}
        </div>

        {asrStatus === "failed" && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (storageKey) void startAsr(storageKey)
              }}
              className="h-8 rounded-[var(--radius-pill)] border border-[var(--color-border)] px-3 text-xs font-medium hover:bg-[var(--color-surface-1)] transition-colors"
            >
              {t("retryAutoTranscribe")}
            </button>
            {asrError && <p className="text-xs text-[var(--color-text-tertiary)]">{asrError}</p>}
          </div>
        )}

        {autoScript && autoScript !== script && (
          <button
            type="button"
            onClick={() => setScript(autoScript)}
            className="h-8 rounded-[var(--radius-pill)] border border-[var(--color-accent)] px-3 text-xs font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] transition-colors"
          >
            {t("useAutoTranscript")}
          </button>
        )}

        <textarea
          value={script}
          onChange={(event) => setScript(event.target.value)}
          rows={10}
          className="w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
          placeholder={t("revoiceScriptPlaceholder")}
        />
        <p className="text-xs text-[var(--color-text-tertiary)]">
          {t("revoiceScriptHint")}
        </p>
      </div>

      {parseError && <p className="text-sm text-[var(--color-danger)]">{parseError}</p>}
      {revoiceMutation.error && <p className="text-sm text-[var(--color-danger)]">{revoiceMutation.error.message}</p>}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button
          type="submit"
          disabled={revoiceMutation.isPending || uploading || !storageKey || !script.trim() || (!hasSpeakerA && !hasSpeakerB) || ((!hasSpeakerA || keepSpeakerA) && (!hasSpeakerB || keepSpeakerB)) || (hasSpeakerA && !keepSpeakerA && !profileAId) || (hasSpeakerB && !keepSpeakerB && !(profileBId || profileAId))}
          className="rounded-[var(--radius-warm-btn)] bg-[var(--color-accent)] px-6 py-2.5 text-sm font-medium text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          {revoiceMutation.isPending ? t("processing") : `${t("revoiceAudioBtn")} (${estimatedMinutes.toFixed(1)} ${t("minShort")})`}
        </button>
        <EstimatedCost providerId={providerId} minutes={estimatedMinutes} />
      </div>
    </form>
  )
}

interface SpeakerModeToggleProps {
  keepOriginal: boolean
  onChange: (keepOriginal: boolean) => void
  t: (key: "revoiceSpeakerAction" | "replaceSpeakerVoice" | "keepOriginalVoice") => string
  name: string
}

function SpeakerModeToggle({ keepOriginal, onChange, t, name }: SpeakerModeToggleProps) {
  return (
    <fieldset className="flex flex-wrap gap-4">
      <legend className="sr-only">{t("revoiceSpeakerAction")}</legend>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="radio" name={name} checked={!keepOriginal} onChange={() => onChange(false)} />
        {t("replaceSpeakerVoice")}
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <input type="radio" name={name} checked={keepOriginal} onChange={() => onChange(true)} />
        {t("keepOriginalVoice")}
      </label>
    </fieldset>
  )
}
