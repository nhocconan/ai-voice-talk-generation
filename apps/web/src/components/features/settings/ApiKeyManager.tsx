"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { trpc } from "@/lib/trpc/client"
import { KeyIcon, PlusIcon, TrashIcon, CopyIcon, CheckIcon } from "lucide-react"

export function ApiKeyManager() {
  const t = useTranslations("settings")
  const utils = trpc.useUtils()
  const { data: keys, isLoading } = trpc.apiKey.list.useQuery()
  const createMutation = trpc.apiKey.create.useMutation({
    onSuccess: (data) => {
      setNewKey(data.key)
      void utils.apiKey.list.invalidate()
      setShowCreate(false)
      setNewName("")
      setExpiresInDays(undefined)
    },
  })
  const revokeMutation = trpc.apiKey.revoke.useMutation({
    onSuccess: () => {
      void utils.apiKey.list.invalidate()
    },
  })

  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState("")
  const [expiresInDays, setExpiresInDays] = useState<number | undefined>()
  const [newKey, setNewKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function copyKey() {
    if (!newKey) return
    await navigator.clipboard.writeText(newKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div
      className="bg-[var(--color-surface-0)] rounded-[var(--radius-card)] p-6"
      style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <KeyIcon size={18} className="text-[var(--color-text-muted)]" />
          <h2 className="font-semibold text-[var(--color-text-primary)]">{t("apiKeys")}</h2>
        </div>
        <button
          onClick={() => {
            setShowCreate(true)
            setNewKey(null)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-[var(--radius-btn)] bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity"
        >
          <PlusIcon size={14} />
          {t("newKey")}
        </button>
      </div>

      {newKey && (
        <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 dark:bg-emerald-400/10 dark:border-emerald-400/30">
          <p className="text-xs text-[var(--color-success)] mb-1 font-medium">
            {t("copyKeyNow")}
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 font-mono text-xs bg-[var(--color-surface-0)] border border-green-200 dark:border-emerald-400/30 rounded px-2 py-1 truncate">
              {newKey}
            </code>
            <button onClick={copyKey} className="shrink-0 p-1.5 rounded hover:bg-green-100 dark:hover:bg-emerald-400/20">
              {copied ? <CheckIcon size={14} className="text-[var(--color-success)]" /> : <CopyIcon size={14} className="text-[var(--color-success)]" />}
            </button>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="mb-4 p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] space-y-3">
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
              {t("keyName")}
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t("keyNamePlaceholder")}
              className="w-full rounded px-3 py-1.5 text-sm border border-[var(--color-border)] bg-[var(--color-surface-0)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
              {t("expiresInDays")}
            </label>
            <input
              type="number"
              min={1}
              max={365}
              value={expiresInDays ?? ""}
              onChange={(e) => setExpiresInDays(e.target.value ? Number(e.target.value) : undefined)}
              placeholder={t("never")}
              className="w-full rounded px-3 py-1.5 text-sm border border-[var(--color-border)] bg-[var(--color-surface-0)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowCreate(false)}
              className="px-3 py-1.5 text-sm rounded-[var(--radius-btn)] border border-[var(--color-border)] hover:bg-[var(--color-surface-0)] transition-colors"
            >
              {t("cancel")}
            </button>
            <button
              disabled={!newName.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate({ name: newName.trim(), expiresInDays })}
              className="px-3 py-1.5 text-sm rounded-[var(--radius-btn)] bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {createMutation.isPending ? t("creating") : t("create")}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-10 rounded bg-[var(--color-surface-1)] animate-pulse" />
          ))}
        </div>
      ) : !keys?.length ? (
        <p className="text-sm text-[var(--color-text-muted)] py-4 text-center">
          {t("emptyState")}
        </p>
      ) : (
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
              <th className="text-left pb-2">{t("tableName")}</th>
              <th className="text-left pb-2">{t("tablePrefix")}</th>
              <th className="text-left pb-2">{t("tableLastUsed")}</th>
              <th className="text-left pb-2">{t("tableExpires")}</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {keys.map((key) => (
              <tr key={key.id}>
                <td className="py-2.5 font-medium text-[var(--color-text-primary)]">{key.name}</td>
                <td className="py-2.5 font-mono text-xs text-[var(--color-text-muted)]">{key.prefix}…</td>
                <td className="py-2.5 text-[var(--color-text-muted)]">
                  {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : t("never")}
                </td>
                <td className="py-2.5 text-[var(--color-text-muted)]">
                  {key.expiresAt ? new Date(key.expiresAt).toLocaleDateString() : t("never")}
                </td>
                <td className="py-2.5 text-right">
                  <button
                    onClick={() => {
                      if (confirm(t("revokeConfirm"))) {
                        revokeMutation.mutate({ id: key.id })
                      }
                    }}
                    className="p-1 rounded hover:bg-[var(--color-accent-soft)] text-[var(--color-danger)] transition-colors"
                    title={t("revoke")}
                  >
                    <TrashIcon size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </div>
  )
}
