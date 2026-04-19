"use client"

import { useState } from "react"
import { trpc } from "@/lib/trpc/client"
import { CheckCircleIcon, XCircleIcon, StarIcon } from "lucide-react"

export function ProviderManager() {
  const { data: providers, refetch } = trpc.admin.listProviders.useQuery()
  const update = trpc.admin.updateProvider.useMutation({ onSuccess: () => refetch() })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState("")

  function startEditing(providerId: string) {
    setEditingId((currentId) => (currentId === providerId ? null : providerId))
    setApiKey("")
  }

  function stopEditing() {
    setEditingId(null)
    setApiKey("")
  }

  return (
    <div className="space-y-3">
      {providers?.map((provider) => (
        <div
          key={provider.id}
          className="bg-[var(--color-surface-0)] rounded-[var(--radius-card)] p-5"
          style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-body-med">{provider.name}</h3>
                {provider.isDefault && (
                  <span className="flex items-center gap-1 text-micro px-2 py-0.5 rounded-full bg-[var(--color-surface-1)]">
                    <StarIcon size={10} /> Default
                  </span>
                )}
                {provider.enabled ? (
                  <CheckCircleIcon size={14} style={{ color: "var(--color-success)" }} />
                ) : (
                  <XCircleIcon size={14} style={{ color: "var(--color-text-muted)" }} />
                )}
              </div>
              <p className="text-caption text-[var(--color-text-muted)] mt-1">
                API key: {provider.apiKeyLast4 ? `••••${provider.apiKeyLast4}` : provider.apiKeyEnc ? "•••• stored" : "Not configured"}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => update.mutate({ id: provider.id, enabled: !provider.enabled })}
                className="text-caption border border-[var(--color-border)] px-3 py-1.5 rounded-[var(--radius-pill)] hover:bg-[var(--color-surface-1)] transition-colors"
              >
                {provider.enabled ? "Disable" : "Enable"}
              </button>
              {!provider.isDefault && provider.enabled && (
                <button
                  onClick={() => update.mutate({ id: provider.id, isDefault: true })}
                  className="text-caption border border-[var(--color-border)] px-3 py-1.5 rounded-[var(--radius-pill)] hover:bg-[var(--color-surface-1)] transition-colors"
                >
                  Set Default
                </button>
              )}
              <button
                onClick={() => startEditing(provider.id)}
                className="text-caption border border-[var(--color-border)] px-3 py-1.5 rounded-[var(--radius-pill)] hover:bg-[var(--color-surface-1)] transition-colors"
              >
                {editingId === provider.id ? "Cancel" : provider.apiKeyEnc ? "Replace Key" : "Add Key"}
              </button>
            </div>
          </div>

          {editingId === provider.id && (
            <div className="mt-4 space-y-3">
              <p className="text-caption text-[var(--color-text-muted)]">
                {provider.apiKeyEnc
                  ? "A key is already stored. Saving here replaces it; leaving this blank keeps the current secret unchanged."
                  : "Paste the provider API key. It stays hidden after save."}
              </p>

              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={provider.apiKeyEnc ? "Paste replacement API key…" : "Paste API key…"}
                  className="flex-1 px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui font-mono text-sm"
                />
                <button
                  onClick={async () => {
                    await update.mutateAsync({ id: provider.id, apiKey })
                    stopEditing()
                  }}
                  disabled={!apiKey || update.isPending}
                  className="h-9 px-4 rounded-[var(--radius-pill)] bg-black text-white text-button disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  onClick={() => stopEditing()}
                  className="h-9 px-4 rounded-[var(--radius-pill)] border border-[var(--color-border)] text-caption hover:bg-[var(--color-surface-1)] transition-colors"
                >
                  Keep Current
                </button>
                {provider.apiKeyEnc && (
                  <button
                    onClick={async () => {
                      await update.mutateAsync({ id: provider.id, apiKey: "" })
                      stopEditing()
                    }}
                    disabled={update.isPending}
                    className="h-9 px-4 rounded-[var(--radius-pill)] border border-[var(--color-border)] text-caption hover:bg-[var(--color-surface-1)] transition-colors disabled:opacity-50"
                  >
                    Clear Key
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
