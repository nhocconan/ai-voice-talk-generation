"use client"

import { useState } from "react"
import {
  BeakerIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ExternalLinkIcon,
  StarIcon,
  XCircleIcon,
} from "lucide-react"
import { trpc } from "@/lib/trpc/client"
import {
  type ProviderConfigField,
  getProviderMeta,
} from "@/lib/providers-meta"

type DraftValue = string | boolean

function isConfigRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function stringifyConfigValue(value: unknown, field: ProviderConfigField): string | boolean {
  if (field.input === "boolean") {
    return Boolean(value)
  }
  if (value === undefined || value === null) {
    return ""
  }
  return String(value)
}

function parseConfigValue(field: ProviderConfigField, value: DraftValue): unknown {
  if (field.input === "boolean") {
    return Boolean(value)
  }
  if (field.input === "number") {
    const trimmed = String(value).trim()
    return trimmed ? Number(trimmed) : null
  }
  const trimmed = String(value).trim()
  return trimmed
}

function configSummary(config: Record<string, unknown>, keys: string[]): string {
  return keys
    .map((key) => {
      const value = config[key]
      if (value === undefined || value === null || value === "") return null
      return `${key}=${String(value)}`
    })
    .filter(Boolean)
    .join(" · ")
}

export function ProviderManager() {
  const { data: providers, refetch } = trpc.admin.listProviders.useQuery()
  const update = trpc.admin.updateProvider.useMutation({ onSuccess: () => refetch() })
  const testProvider = trpc.system.testProvider.useMutation()

  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [apiKey, setApiKey] = useState("")
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; message: string }>>({})
  const [testingId, setTestingId] = useState<string | null>(null)
  const [configDrafts, setConfigDrafts] = useState<Record<string, Record<string, DraftValue>>>({})

  function startEditing(providerId: string) {
    setEditingId((currentId) => (currentId === providerId ? null : providerId))
    setApiKey("")
  }

  function stopEditing() {
    setEditingId(null)
    setApiKey("")
  }

  function getProviderConfig(provider: { id: string; config: unknown }, defaults: Record<string, unknown> | undefined) {
    const baseConfig = defaults ? { ...defaults } : {}
    const persisted = isConfigRecord(provider.config) ? provider.config : {}
    return { ...baseConfig, ...persisted }
  }

  function getDraftValue(
    providerId: string,
    field: ProviderConfigField,
    providerConfig: Record<string, unknown>,
  ): DraftValue {
    const draft = configDrafts[providerId]
    if (draft && field.key in draft) {
      return draft[field.key]!
    }
    return stringifyConfigValue(providerConfig[field.key], field)
  }

  function setDraftValue(providerId: string, key: string, value: DraftValue) {
    setConfigDrafts((prev) => ({
      ...prev,
      [providerId]: {
        ...(prev[providerId] ?? {}),
        [key]: value,
      },
    }))
  }

  async function runTest(providerId: string, overrideKey?: string) {
    setTestingId(providerId)
    try {
      const result = await testProvider.mutateAsync({ id: providerId, apiKey: overrideKey })
      setTestResult((prev) => ({ ...prev, [providerId]: result }))
      return result
    } catch (e) {
      const result = { ok: false, message: `Test failed: ${String(e)}` }
      setTestResult((prev) => ({ ...prev, [providerId]: result }))
      return result
    } finally {
      setTestingId(null)
    }
  }

  return (
    <div className="space-y-3">
      {providers?.map((provider) => {
        const meta = getProviderMeta(provider.name)
        const result = testResult[provider.id]
        const expanded = expandedId === provider.id
        const providerConfig = getProviderConfig(provider, meta?.defaultConfig)
        const summary = configSummary(providerConfig, ["mode", "device", "model", "apiBase"])

        return (
          <div
            key={provider.id}
            className="bg-[var(--color-surface-0)] rounded-[var(--radius-card)] p-5"
            style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
          >
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-body-med">{meta?.name ?? provider.name}</h3>
                  <span className="text-micro text-[var(--color-text-muted)] font-mono">{provider.name}</span>
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
                {meta?.tagline && (
                  <p className="text-caption text-[var(--color-text-secondary)] mt-1">{meta.tagline}</p>
                )}
                <p className="text-caption text-[var(--color-text-muted)] mt-1">
                  API key: {provider.apiKeyLast4 ? `••••${provider.apiKeyLast4}` : provider.apiKeyEnc ? "•••• stored" : meta?.needsApiKey ? "Not configured" : "Not required"}
                </p>
                {summary && (
                  <p className="text-caption text-[var(--color-text-muted)] mt-1 font-mono">
                    {summary}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => runTest(provider.id)}
                  disabled={testingId === provider.id || (meta?.needsApiKey && !provider.apiKeyEnc)}
                  className="flex items-center gap-1.5 text-caption border border-[var(--color-border)] px-3 py-1.5 rounded-[var(--radius-pill)] hover:bg-[var(--color-surface-1)] transition-colors disabled:opacity-50"
                  title={meta?.needsApiKey && !provider.apiKeyEnc ? "Add an API key first" : "Run a live test"}
                >
                  <BeakerIcon size={12} />
                  {testingId === provider.id ? "Testing…" : "Test"}
                </button>
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
                {meta?.needsApiKey && (
                  <button
                    onClick={() => startEditing(provider.id)}
                    className="text-caption border border-[var(--color-border)] px-3 py-1.5 rounded-[var(--radius-pill)] hover:bg-[var(--color-surface-1)] transition-colors"
                  >
                    {editingId === provider.id ? "Cancel" : provider.apiKeyEnc ? "Replace Key" : "Add Key"}
                  </button>
                )}
                <button
                  onClick={() => setExpandedId(expanded ? null : provider.id)}
                  className="flex items-center gap-1 text-caption border border-[var(--color-border)] px-3 py-1.5 rounded-[var(--radius-pill)] hover:bg-[var(--color-surface-1)] transition-colors"
                >
                  {expanded ? <><ChevronUpIcon size={12} /> Hide setup</> : <><ChevronDownIcon size={12} /> Setup + config</>}
                </button>
              </div>
            </div>

            {result && (
              <div
                className="mt-3 p-3 rounded-[var(--radius-md)] text-caption"
                style={{
                  background: result.ok ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
                  color: result.ok ? "var(--color-success)" : "var(--color-error)",
                  border: `1px solid ${result.ok ? "var(--color-success)" : "var(--color-error)"}`,
                }}
              >
                {result.ok ? "✓ " : "✗ "}
                {result.message}
              </div>
            )}

            {editingId === provider.id && meta?.needsApiKey && (
              <div className="mt-4 space-y-3">
                <p className="text-caption text-[var(--color-text-muted)]">
                  {provider.apiKeyEnc
                    ? "A key is already stored. Saving here replaces it; leaving this blank keeps the current secret unchanged."
                    : "Paste the provider API key. It stays hidden after save."}
                </p>

                <div className="flex gap-2 flex-wrap">
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={provider.apiKeyEnc ? "Paste replacement API key…" : "Paste API key…"}
                    className="flex-1 min-w-[240px] px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui font-mono text-sm"
                  />
                  <button
                    onClick={async () => {
                      const probe = await runTest(provider.id, apiKey)
                      if (!probe.ok) return
                      await update.mutateAsync({ id: provider.id, apiKey })
                      stopEditing()
                    }}
                    disabled={!apiKey || update.isPending || testingId === provider.id}
                    className="h-9 px-4 rounded-[var(--radius-pill)] bg-black text-white text-button disabled:opacity-50"
                    title="Verifies the key with a live call before saving"
                  >
                    Test &amp; Save
                  </button>
                  <button
                    onClick={async () => {
                      await update.mutateAsync({ id: provider.id, apiKey })
                      stopEditing()
                    }}
                    disabled={!apiKey || update.isPending}
                    className="h-9 px-4 rounded-[var(--radius-pill)] border border-[var(--color-border)] text-caption hover:bg-[var(--color-surface-1)] transition-colors disabled:opacity-50"
                    title="Save without testing (not recommended)"
                  >
                    Save anyway
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

            {expanded && meta && (
              <div className="mt-5 pt-4 space-y-5" style={{ borderTop: "1px solid var(--color-border)" }}>
                <section className="flex flex-wrap gap-2">
                  {meta.docsLinks.map((link) => (
                    <a
                      key={link.url}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-caption underline"
                      style={{ color: "var(--color-accent)" }}
                    >
                      {link.label} <ExternalLinkIcon size={11} />
                    </a>
                  ))}
                </section>

                <section>
                  <h4 className="text-body-med text-[var(--color-text-primary)]">Setup steps</h4>
                  <ol className="list-decimal ml-5 mt-2 space-y-1 text-caption text-[var(--color-text-secondary)]">
                    {meta.setupSteps.map((step, i) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </section>

                {meta.configFields && meta.configFields.length > 0 && (
                  <section className="space-y-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <h4 className="text-body-med text-[var(--color-text-primary)]">Configuration</h4>
                        <p className="text-caption text-[var(--color-text-muted)]">
                          Save provider-specific runtime settings here. They are stored in `provider_configs.config`.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setConfigDrafts((prev) => ({ ...prev, [provider.id]: {} }))}
                          className="text-caption border border-[var(--color-border)] px-3 py-1.5 rounded-[var(--radius-pill)] hover:bg-[var(--color-surface-1)] transition-colors"
                        >
                          Reset draft
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            const config = meta.configFields?.reduce<Record<string, unknown>>((acc, field) => {
                              acc[field.key] = parseConfigValue(
                                field,
                                getDraftValue(provider.id, field, providerConfig),
                              )
                              return acc
                            }, {})
                            await update.mutateAsync({ id: provider.id, config })
                            setConfigDrafts((prev) => ({ ...prev, [provider.id]: {} }))
                          }}
                          disabled={update.isPending}
                          className="h-9 px-4 rounded-[var(--radius-pill)] bg-black text-white text-button disabled:opacity-50"
                        >
                          Save config
                        </button>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      {meta.configFields.map((field) => {
                        const rawValue = getDraftValue(provider.id, field, providerConfig)
                        return (
                          <label key={field.key} className={field.input === "textarea" ? "md:col-span-2" : ""}>
                            <span className="block text-caption text-[var(--color-text-primary)] mb-1">
                              {field.label}
                            </span>
                            {field.input === "select" ? (
                              <select
                                value={String(rawValue)}
                                onChange={(e) => setDraftValue(provider.id, field.key, e.target.value)}
                                className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui bg-white"
                              >
                                {field.options?.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            ) : field.input === "boolean" ? (
                              <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2">
                                <input
                                  type="checkbox"
                                  checked={Boolean(rawValue)}
                                  onChange={(e) => setDraftValue(provider.id, field.key, e.target.checked)}
                                />
                                <span className="text-caption text-[var(--color-text-secondary)]">{field.description}</span>
                              </div>
                            ) : field.input === "textarea" ? (
                              <textarea
                                value={String(rawValue)}
                                onChange={(e) => setDraftValue(provider.id, field.key, e.target.value)}
                                placeholder={field.placeholder}
                                rows={3}
                                className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui"
                              />
                            ) : (
                              <input
                                type={field.input === "number" ? "number" : field.input}
                                value={String(rawValue)}
                                onChange={(e) => setDraftValue(provider.id, field.key, e.target.value)}
                                placeholder={field.placeholder}
                                className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui"
                              />
                            )}
                            {field.input !== "boolean" && (
                              <span className="mt-1 block text-micro text-[var(--color-text-muted)]">
                                {field.description}
                              </span>
                            )}
                          </label>
                        )
                      })}
                    </div>
                  </section>
                )}

                <section>
                  <h4 className="text-body-med text-[var(--color-text-primary)]">Supports in this system</h4>
                  <ul className="list-disc ml-5 mt-2 space-y-1 text-caption text-[var(--color-text-secondary)]">
                    {meta.helpsWith.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </section>

                <section>
                  <h4 className="text-body-med text-[var(--color-text-primary)]">Capabilities</h4>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {Object.entries(meta.supports)
                      .filter(([key]) => key !== "languages")
                      .map(([key, enabled]) => (
                        <span
                          key={key}
                          className="text-micro px-2 py-0.5 rounded-full"
                          style={{
                            background: enabled ? "rgba(34,197,94,0.1)" : "var(--color-surface-1)",
                            color: enabled ? "var(--color-success)" : "var(--color-text-muted)",
                            border: `1px solid ${enabled ? "var(--color-success)" : "var(--color-border)"}`,
                          }}
                        >
                          {enabled ? "✓" : "✗"} {key}
                        </span>
                      ))}
                  </div>
                  <p className="text-caption text-[var(--color-text-muted)] mt-2">
                    Languages: {meta.supports.languages.join(", ")}
                  </p>
                </section>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
