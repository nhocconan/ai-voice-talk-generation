"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { trpc } from "@/lib/trpc/client"
import { RefreshCwIcon, Trash2Icon } from "lucide-react"

type ModelKind = "TTS" | "STT" | "LLM"

const KIND_BADGE: Record<ModelKind, string> = {
  TTS: "bg-[var(--color-accent-soft)] text-[var(--color-accent)]",
  STT: "bg-[var(--color-surface-1)] text-[var(--color-text-secondary)]",
  LLM: "bg-[var(--color-surface-warm)] text-[var(--color-text-secondary)]",
}

export function ModelCatalogManager() {
  const t = useTranslations("admin")
  const providersQ = trpc.generation.listAvailableProviders.useQuery()
  const [selected, setSelected] = useState<string>("")
  const providerId = selected !== "" ? selected : (providersQ.data?.[0]?.id ?? "")
  const modelsQ = trpc.admin.listProviderModels.useQuery(
    { providerId },
    { enabled: !!providerId },
  )
  const fetchM = trpc.admin.fetchProviderModels.useMutation({
    onSuccess: () => modelsQ.refetch(),
  })
  const updateM = trpc.admin.updateProviderModel.useMutation({
    onSuccess: () => modelsQ.refetch(),
  })
  const deleteM = trpc.admin.deleteProviderModel.useMutation({
    onSuccess: () => modelsQ.refetch(),
  })

  const models = useMemo(() => modelsQ.data ?? [], [modelsQ.data])
  const selectedProvider = providersQ.data?.find((p) => p.id === providerId)

  return (
    <div className="space-y-6">
      {/* Provider picker + fetch */}
      <section
        className="bg-[var(--color-surface-0)] rounded-[var(--radius-card)] p-6"
        style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
      >
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[220px]">
            <label htmlFor="provider-picker" className="block text-caption mb-2">
              {t("modelCatalog.provider")}
            </label>
            <select
              id="provider-picker"
              value={providerId}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui bg-[var(--color-surface-0)]"
            >
              {(providersQ.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.isDefault ? ` · ${t("modelCatalog.defaultSuffix")}` : ""}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            disabled={!providerId || fetchM.isPending}
            onClick={() => fetchM.mutate({ providerId })}
            className="h-10 px-5 inline-flex items-center gap-2 rounded-[var(--radius-pill)] bg-[var(--color-btn-primary-bg)] text-[var(--color-btn-primary-fg)] text-button disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            <RefreshCwIcon size={14} className={fetchM.isPending ? "animate-spin" : ""} aria-hidden />
            {fetchM.isPending ? t("modelCatalog.fetching") : t("modelCatalog.fetchLatest")}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-micro text-[var(--color-text-muted)]">
          <span>
            {t("modelCatalog.modelsOnFile", { count: models.length })}
          </span>
          {fetchM.data && (
            <span>
              {t("modelCatalog.syncedFrom", { count: fetchM.data.count })}{" "}
              <strong className="text-[var(--color-text-primary)]">{fetchM.data.source}</strong>{" "}
              {t("modelCatalog.sourceSuffix")}
            </span>
          )}
          {selectedProvider && (
            <span>
              {t("modelCatalog.providerLabel")}:{" "}
              <strong className="text-[var(--color-text-primary)]">{selectedProvider.name}</strong>
            </span>
          )}
        </div>

        {fetchM.error && (
          <p className="mt-3 text-micro text-[var(--color-danger)]" role="alert">
            {fetchM.error.message}
          </p>
        )}
      </section>

      {/* Catalog table */}
      <section
        className="bg-[var(--color-surface-0)] rounded-[var(--radius-card)] overflow-hidden"
        style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
      >
        <div className="overflow-x-auto">
          <div className="overflow-x-auto"><table className="min-w-full text-sm">
            <thead>
              <tr className="bg-[var(--color-surface-1)] text-left text-micro uppercase tracking-wide text-[var(--color-text-muted)]">
                <th className="px-4 py-3 font-medium">{t("modelCatalog.colModelId")}</th>
                <th className="px-4 py-3 font-medium">{t("modelCatalog.colDisplayName")}</th>
                <th className="px-4 py-3 font-medium">{t("modelCatalog.colKind")}</th>
                <th className="px-4 py-3 font-medium">{t("modelCatalog.colLanguages")}</th>
                <th className="px-4 py-3 font-medium text-center">{t("modelCatalog.colEnabled")}</th>
                <th className="px-4 py-3 font-medium text-center">{t("modelCatalog.colDefault")}</th>
                <th className="px-4 py-3 font-medium">{t("modelCatalog.colSynced")}</th>
                <th className="px-4 py-3 font-medium" aria-label={t("modelCatalog.colActions")} />
              </tr>
            </thead>
            <tbody>
              {modelsQ.isLoading && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-[var(--color-text-muted)]">
                    {t("modelCatalog.loading")}
                  </td>
                </tr>
              )}
              {!modelsQ.isLoading && models.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center">
                    <p className="text-body-ui text-[var(--color-text-secondary)]">
                      {t("modelCatalog.noModels")}
                    </p>
                    <p className="text-micro text-[var(--color-text-muted)] mt-1">
                      {t.rich("modelCatalog.noModelsHint", { em: (chunks) => <em>{chunks}</em> })}
                    </p>
                  </td>
                </tr>
              )}
              {models.map((m) => (
                <tr
                  key={m.id}
                  className="border-t border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-1)]/40 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-micro text-[var(--color-text-secondary)]">
                    {m.modelId}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      defaultValue={m.displayName}
                      onBlur={(e) =>
                        e.target.value !== m.displayName &&
                        updateM.mutate({ id: m.id, displayName: e.target.value })
                      }
                      className="w-full bg-transparent border-b border-transparent hover:border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none text-body-ui py-1"
                      aria-label={t("modelCatalog.displayNameAria", { modelId: m.modelId })}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <select
                      defaultValue={m.kind}
                      onChange={(e) =>
                        updateM.mutate({ id: m.id, kind: e.target.value as ModelKind })
                      }
                      className={`text-micro font-medium rounded-[var(--radius-sm)] px-2 py-1 border-0 ${KIND_BADGE[m.kind as ModelKind]}`}
                      aria-label={t("modelCatalog.kindAria", { modelId: m.modelId })}
                    >
                      <option>TTS</option>
                      <option>STT</option>
                      <option>LLM</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <input
                      defaultValue={m.languages.join(", ")}
                      onBlur={(e) => {
                        const langs = e.target.value
                          .split(",")
                          .map((s) => s.trim())
                          .filter(Boolean)
                        updateM.mutate({ id: m.id, languages: langs })
                      }}
                      placeholder="en, vi, …"
                      className="w-32 bg-transparent border-b border-transparent hover:border-[var(--color-border)] focus:border-[var(--color-accent)] focus:outline-none text-micro font-mono py-1"
                      aria-label={t("modelCatalog.languagesAria", { modelId: m.modelId })}
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      defaultChecked={m.enabled}
                      onChange={(e) => updateM.mutate({ id: m.id, enabled: e.target.checked })}
                      className="h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-accent)]"
                      aria-label={t("modelCatalog.enableAria", { modelId: m.modelId })}
                    />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={m.isDefault}
                      onChange={(e) => updateM.mutate({ id: m.id, isDefault: e.target.checked })}
                      className="h-4 w-4 rounded-full border-[var(--color-border)] text-[var(--color-accent)]"
                      aria-label={t("modelCatalog.markDefaultAria", { modelId: m.modelId })}
                    />
                  </td>
                  <td className="px-4 py-3 text-micro text-[var(--color-text-muted)] whitespace-nowrap">
                    {m.lastSyncedAt
                      ? new Date(m.lastSyncedAt).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        if (confirm(t("modelCatalog.deleteConfirm", { modelId: m.modelId }))) deleteM.mutate({ id: m.id })
                      }}
                      className="inline-flex items-center gap-1 text-micro text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-colors"
                      aria-label={t("modelCatalog.deleteAria", { modelId: m.modelId })}
                    >
                      <Trash2Icon size={14} aria-hidden />
                      {t("modelCatalog.delete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </section>
    </div>
  )
}
