"use client"

import { useState } from "react"
import { trpc } from "@/lib/trpc/client"
import { CheckCircleIcon, XCircleIcon, StarIcon } from "lucide-react"

export function ProviderManager() {
  const { data: providers, refetch } = trpc.admin.listProviders.useQuery()
  const update = trpc.admin.updateProvider.useMutation({ onSuccess: () => refetch() })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState("")

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
              {provider.apiKeyPreview && (
                <p className="text-caption text-[var(--color-text-muted)] mt-1">
                  API key: {provider.apiKeyPreview}
                </p>
              )}
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
                onClick={() => { setEditingId(editingId === provider.id ? null : provider.id); setApiKey("") }}
                className="text-caption border border-[var(--color-border)] px-3 py-1.5 rounded-[var(--radius-pill)] hover:bg-[var(--color-surface-1)] transition-colors"
              >
                {editingId === provider.id ? "Cancel" : "Edit Key"}
              </button>
            </div>
          </div>

          {editingId === provider.id && (
            <div className="mt-4 flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste new API key…"
                className="flex-1 px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui font-mono text-sm"
              />
              <button
                onClick={async () => {
                  await update.mutateAsync({ id: provider.id, apiKey })
                  setEditingId(null)
                  setApiKey("")
                }}
                disabled={!apiKey || update.isPending}
                className="h-9 px-4 rounded-[var(--radius-pill)] bg-black text-white text-button disabled:opacity-50"
              >
                Save
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
