"use client"

import { useEffect, useState } from "react"
import { trpc } from "@/lib/trpc/client"

// Admin card to configure Google reCAPTCHA for the login form. Enabling is
// gated server-side on the secret being accepted by Google.
export function RecaptchaSettings() {
  const utils = trpc.useUtils()
  const { data } = trpc.admin.getRecaptcha.useQuery()
  const update = trpc.admin.updateRecaptcha.useMutation({
    onSuccess: () => {
      setMsg({ kind: "ok", text: "Saved." })
      setSecretKey("")
      void utils.admin.getRecaptcha.invalidate()
    },
    onError: (e) => setMsg({ kind: "err", text: e.message }),
  })

  const [enabled, setEnabled] = useState(false)
  const [version, setVersion] = useState<"v2" | "v3">("v2")
  const [siteKey, setSiteKey] = useState("")
  const [secretKey, setSecretKey] = useState("")
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null)

  useEffect(() => {
    if (!data) return
    setEnabled(data.enabled)
    setVersion(data.version)
    setSiteKey(data.siteKey)
  }, [data])

  const onSave = () => {
    setMsg(null)
    update.mutate({
      enabled,
      version,
      siteKey,
      ...(secretKey ? { secretKey } : {}),
    })
  }

  const inputCls =
    "w-full px-3 py-2 rounded-[var(--radius-md)] bg-[var(--color-surface-0)] text-body-ui border border-[var(--color-border)] focus:outline-none focus:ring-2 focus:ring-[var(--color-ring)]"

  return (
    <div
      className="bg-[var(--color-surface-0)] p-6 rounded-[var(--radius-card)] space-y-4"
      style={{ boxShadow: "var(--shadow-outline-ring)" }}
    >
      <div>
        <h2 className="text-display-card">Login reCAPTCHA</h2>
        <p className="text-caption text-[var(--color-text-secondary)] mt-1">
          Protect the login form with Google reCAPTCHA. Enabling requires a valid secret key.
        </p>
      </div>

      <label className="flex items-center gap-2 text-body-ui select-none">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
        />
        Enable reCAPTCHA on login
      </label>

      <div>
        <label className="block text-caption mb-1.5">Version</label>
        <select value={version} onChange={(e) => setVersion(e.target.value as "v2" | "v3")} className={inputCls}>
          <option value="v2">v2 (checkbox)</option>
          <option value="v3">v3 (invisible, score-based)</option>
        </select>
      </div>

      <div>
        <label className="block text-caption mb-1.5">Site key</label>
        <input value={siteKey} onChange={(e) => setSiteKey(e.target.value)} className={inputCls} placeholder="6Lc..." />
      </div>

      <div>
        <label className="block text-caption mb-1.5">
          Secret key {data?.hasSecret && <span className="text-[var(--color-text-muted)]">(stored — leave blank to keep)</span>}
        </label>
        <input
          type="password"
          value={secretKey}
          onChange={(e) => setSecretKey(e.target.value)}
          className={inputCls}
          placeholder={data?.hasSecret ? "••••••••" : "6Lc..."}
          autoComplete="off"
        />
      </div>

      {msg && (
        <div
          className={`text-body-ui rounded-[var(--radius-md)] px-3 py-2 ${
            msg.kind === "ok" ? "text-[var(--color-success)]" : "text-[var(--color-danger)] bg-[var(--color-accent-soft)]"
          }`}
        >
          {msg.text}
        </div>
      )}

      <button
        onClick={onSave}
        disabled={update.isPending}
        className="h-10 px-5 rounded-[var(--radius-pill)] bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)] text-button disabled:opacity-50 hover:opacity-90 transition-opacity"
      >
        {update.isPending ? "Saving…" : "Save"}
      </button>
    </div>
  )
}
