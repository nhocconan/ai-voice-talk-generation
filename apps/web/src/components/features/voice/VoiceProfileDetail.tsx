"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { CheckIcon, Loader2Icon, MicIcon, PlayIcon, RotateCcwIcon, SaveIcon, TrashIcon, UploadIcon } from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import { cn, formatDuration } from "@/lib/utils"
import { AudioUploader } from "./AudioUploader"
import { getGuidedPrompts } from "./guidedPrompts"
import { InBrowserRecorder } from "./InBrowserRecorder"
import { QualityBadge } from "./QualityBadge"

interface Props {
  profileId: string
}

export function VoiceProfileDetail({ profileId }: Props) {
  const t = useTranslations("voices")
  const router = useRouter()
  const utils = trpc.useUtils()
  const { data: profile, isLoading, error } = trpc.voiceProfile.get.useQuery({ id: profileId })
  const updateProfile = trpc.voiceProfile.update.useMutation()
  const deleteProfile = trpc.voiceProfile.delete.useMutation()
  const setActiveVersion = trpc.voiceProfile.setActiveVersion.useMutation()
  const [name, setName] = useState("")
  const [lang, setLang] = useState<"vi" | "en" | "multi">("vi")
  const [xaiVoiceId, setXaiVoiceId] = useState("")
  const [minimaxVoiceId, setMinimaxVoiceId] = useState("")
  const [elevenLabsVoiceId, setElevenLabsVoiceId] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ version: number; url: string } | null>(null)
  const [loadingPreview, setLoadingPreview] = useState<number | null>(null)
  const [sampleMode, setSampleMode] = useState<"guided" | "upload">("guided")

  useEffect(() => {
    if (!profile) return
    setName(profile.name)
    setLang(profile.lang as "vi" | "en" | "multi")
    const voiceIds = (profile.providerVoiceIds ?? {}) as Record<string, string>
    setXaiVoiceId(voiceIds["XAI_TTS"] ?? "")
    setMinimaxVoiceId(voiceIds["MINIMAX_TTS"] ?? "")
    setElevenLabsVoiceId(voiceIds["ELEVENLABS"] ?? "")
  }, [profile])

  async function saveProfile() {
    setMessage(null)
    try {
      await updateProfile.mutateAsync({
        id: profileId,
        name: name.trim(),
        lang,
        providerVoiceIds: {
          XAI_TTS: xaiVoiceId.trim(),
          MINIMAX_TTS: minimaxVoiceId.trim(),
          ELEVENLABS: elevenLabsVoiceId.trim(),
        },
      })
      await utils.voiceProfile.get.invalidate({ id: profileId })
      await utils.voiceProfile.list.invalidate()
      setMessage(t("profileSaved"))
    } catch {
      // The mutation error is rendered below so provider validation failures are actionable.
    }
  }

  async function playSample(version: number) {
    setLoadingPreview(version)
    try {
      const { url } = await utils.voiceProfile.getSampleDownloadUrl.fetch({ profileId, version })
      setPreview({ version, url })
    } finally {
      setLoadingPreview(null)
    }
  }

  async function makeActive(version: number) {
    await setActiveVersion.mutateAsync({ profileId, version })
    await utils.voiceProfile.get.invalidate({ id: profileId })
    await utils.voiceProfile.list.invalidate()
  }

  async function refreshProfile() {
    await utils.voiceProfile.get.invalidate({ id: profileId })
    await utils.voiceProfile.list.invalidate()
    setMessage(t("sampleSubmitted"))
  }

  async function removeProfile() {
    if (!window.confirm(t("deleteConfirm"))) return
    await deleteProfile.mutateAsync({ id: profileId })
    await utils.voiceProfile.list.invalidate()
    router.push("/voices")
  }

  if (isLoading) {
    return <div className="h-48 rounded-[var(--radius-card)] bg-[var(--color-surface-0)] animate-pulse" />
  }

  if (error || !profile) {
    return (
      <div className="space-y-4">
        <p className="text-body text-[var(--color-danger)]">{t("profileNotFound")}</p>
        <Link href="/voices" className="text-button underline">{t("allProfiles")}</Link>
      </div>
    )
  }

  const samples = [...profile.samples].sort((a, b) => b.version - a.version)
  const canEdit = !profile.isLocked
  const profileLang = profile.lang === "en" || profile.lang === "multi" ? profile.lang : "vi"

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/voices" className="text-caption text-[var(--color-text-muted)] hover:underline">
            {t("allProfiles")}
          </Link>
          <h1 className="text-display-card mt-1">{profile.name}</h1>
          <p className="text-body text-[var(--color-text-secondary)] mt-1">
            {profile.lang.toUpperCase()} · {t("samplesCount", { count: samples.length })}
          </p>
        </div>
        {profile.isLocked && (
          <div className="flex items-center gap-2">
            <span className="text-micro px-2 py-1 rounded-[var(--radius-pill)] bg-[var(--color-surface-1)] text-[var(--color-text-muted)]">
              {t("locked")}
            </span>
          </div>
        )}
      </div>

      <section
        className="bg-[var(--color-surface-0)] rounded-[var(--radius-card)] p-5"
        style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-body-med">{t("profileDetails")}</h2>
          <div className="flex items-center gap-3">
            {message && <span className="text-micro text-[var(--color-success)]">{message}</span>}
            <button
              type="button"
              onClick={() => void removeProfile()}
              disabled={profile.isLocked || deleteProfile.isPending}
              className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--color-border)] px-3 text-button text-[var(--color-danger)] hover:bg-[var(--color-surface-1)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleteProfile.isPending ? <Loader2Icon size={14} className="animate-spin" /> : <TrashIcon size={14} />}
              {t("deleteProfile")}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_180px_auto] md:items-end">
          <div>
            <label htmlFor="profile-name" className="block text-caption mb-1.5">{t("profileNameLabel")}</label>
            <input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canEdit}
              className="w-full px-3 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui disabled:opacity-60"
            />
          </div>
          <div>
            <label htmlFor="profile-lang" className="block text-caption mb-1.5">{t("languageLabel")}</label>
            <select
              id="profile-lang"
              value={lang}
              onChange={(e) => setLang(e.target.value as "vi" | "en" | "multi")}
              disabled={!canEdit}
              className="w-full px-3 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui bg-[var(--color-surface-0)] disabled:opacity-60"
            >
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
              <option value="multi">{t("langMulti")}</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => void saveProfile()}
            disabled={!canEdit || updateProfile.isPending || !name.trim()}
            className="inline-flex cursor-pointer items-center justify-center gap-2 h-10 px-5 rounded-[var(--radius-pill)] bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)] text-button disabled:cursor-not-allowed disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {updateProfile.isPending ? <Loader2Icon size={15} className="animate-spin" /> : <SaveIcon size={15} />}
            {t("saveProfile")}
          </button>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <ProviderVoiceIdField id="profile-xai-voice-id" label={t("xaiVoiceIdLabel")} hint={t("xaiVoiceIdHint")} value={xaiVoiceId} onChange={setXaiVoiceId} disabled={!canEdit} />
          <ProviderVoiceIdField id="profile-minimax-voice-id" label={t("minimaxVoiceIdLabel")} hint={t("providerVoiceIdValidatedHint")} value={minimaxVoiceId} onChange={setMinimaxVoiceId} disabled={!canEdit} />
          <ProviderVoiceIdField id="profile-elevenlabs-voice-id" label={t("elevenLabsVoiceIdLabel")} hint={t("providerVoiceIdValidatedHint")} value={elevenLabsVoiceId} onChange={setElevenLabsVoiceId} disabled={!canEdit} />
        </div>
        {updateProfile.error && (
          <p role="alert" className="mt-3 text-micro text-[var(--color-danger)]">
            {updateProfile.error.message}
          </p>
        )}
      </section>

      <section
        className="bg-[var(--color-surface-0)] rounded-[var(--radius-card)] p-5"
        style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-body-med">{t("samples")}</h2>
            <p className="text-caption text-[var(--color-text-muted)] mt-1">{t("samplePreviewHint")}</p>
          </div>
          <div className="inline-flex items-center gap-2 text-caption text-[var(--color-text-muted)]">
            <CheckIcon size={14} />
            {t("activeVersion")}: {profile.activeVersion}
          </div>
        </div>

        {preview && (
          <div className="mb-4 p-3 rounded-[var(--radius-md)] bg-[var(--color-surface-1)]">
            <p className="text-caption mb-2">{t("previewingVersion", { version: preview.version })}</p>
            <audio controls src={preview.url} className="w-full h-10" />
          </div>
        )}

        {samples.length === 0 ? (
          <div className="p-4 rounded-[var(--radius-md)] border border-[var(--color-border)] text-caption text-[var(--color-text-muted)]">
            {t("noSamplesYet")}
          </div>
        ) : (
          <div className="space-y-2">
            {samples.map((sample) => {
              const isActive = profile.activeVersion === sample.version
              return (
                <div
                  key={sample.id}
                  className="flex flex-wrap items-center gap-3 p-3 rounded-[var(--radius-md)] bg-[var(--color-surface-1)]"
                >
                  <div className="flex-1 min-w-48">
                    <p className="text-small">{t("versionLabel", { version: sample.version })}</p>
                    <p className="text-micro text-[var(--color-text-muted)]">
                      {formatDuration(sample.durationMs)} · {new Date(sample.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <QualityBadge score={sample.qualityScore} detail={sample.qualityDetail as never} showHints />
                  {isActive && (
                    <span className="text-micro px-2 py-1 rounded-[var(--radius-pill)] bg-[var(--color-surface-0)]">
                      {t("activeVersion")}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => void playSample(sample.version)}
                    disabled={loadingPreview === sample.version}
                    className="inline-flex cursor-pointer items-center gap-2 h-9 px-3 rounded-[var(--radius-pill)] border border-[var(--color-border)] text-button hover:bg-[var(--color-surface-0)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loadingPreview === sample.version ? <Loader2Icon size={14} className="animate-spin" /> : <PlayIcon size={14} />}
                    {t("preview")}
                  </button>
                  {!isActive && (
                    <button
                      type="button"
                      onClick={() => void makeActive(sample.version)}
                      disabled={setActiveVersion.isPending}
                      className="inline-flex cursor-pointer items-center gap-2 h-9 px-3 rounded-[var(--radius-pill)] border border-[var(--color-border)] text-button hover:bg-[var(--color-surface-0)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <RotateCcwIcon size={14} />
                      {t("useVersion")}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section
        className="bg-[var(--color-surface-0)] rounded-[var(--radius-card)] p-5"
        style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
      >
        <div className="flex items-center gap-2 mb-4">
          {sampleMode === "guided" ? <MicIcon size={16} /> : <UploadIcon size={16} />}
          <h2 className="text-body-med">{t("addTrainingSample")}</h2>
        </div>
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(["guided", "upload"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setSampleMode(mode)}
              className={cn(
                "cursor-pointer p-4 rounded-[var(--radius-card)] text-left border transition-colors",
                sampleMode === mode
                  ? "border-[var(--color-emphasis)] bg-[var(--color-surface-1)]"
                  : "border-[var(--color-border)] hover:bg-[var(--color-surface-1)]",
              )}
            >
              <div className="flex items-center gap-2 text-body-med">
                {mode === "guided" ? <MicIcon size={15} /> : <UploadIcon size={15} />}
                {mode === "guided" ? t("modeGuidedTitle") : t("modeUploadTitle")}
              </div>
              <div className="text-caption text-[var(--color-text-muted)] mt-1">
                {mode === "guided" ? t("modeGuidedDesc") : t("modeUploadDesc")}
              </div>
            </button>
          ))}
        </div>
        {sampleMode === "guided" ? (
          <InBrowserRecorder
            key={profileLang}
            prompts={getGuidedPrompts(profileLang)}
            profileId={profileId}
            onComplete={() => void refreshProfile()}
          />
        ) : (
          <AudioUploader profileId={profileId} onComplete={() => void refreshProfile()} />
        )}
      </section>
    </div>
  )
}

interface ProviderVoiceIdFieldProps {
  id: string
  label: string
  hint: string
  value: string
  onChange: (value: string) => void
  disabled: boolean
}

function ProviderVoiceIdField({ id, label, hint, value, onChange, disabled }: ProviderVoiceIdFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="block text-caption mb-1.5">{label}</label>
      <input id={id} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} placeholder="voice_abc123" className="w-full px-3 py-2.5 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui font-mono disabled:opacity-60" />
      <p className="text-micro text-[var(--color-text-muted)] mt-1.5">{hint}</p>
    </div>
  )
}
