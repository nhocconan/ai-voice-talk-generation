"use client"

import { useState } from "react"
import { trpc } from "@/lib/trpc/client"
import { BuildingIcon, PlusIcon, TrashIcon } from "lucide-react"

export function WorkspaceManager() {
  const utils = trpc.useUtils()
  const { data: workspaces, isLoading } = trpc.workspace.list.useQuery()
  const createMutation = trpc.workspace.create.useMutation({
    onSuccess: () => {
      void utils.workspace.list.invalidate()
      setShowCreate(false)
      setForm({ name: "", slug: "", plan: "free" })
    },
  })
  const deleteMutation = trpc.workspace.delete.useMutation({
    onSuccess: () => {
      void utils.workspace.list.invalidate()
    },
  })

  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name: "", slug: "", plan: "free" })
  const [error, setError] = useState<string | null>(null)

  async function handleCreate() {
    setError(null)
    try {
      await createMutation.mutateAsync({ name: form.name.trim(), slug: form.slug.trim(), plan: form.plan as "free" | "pro" | "enterprise" })
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create workspace")
    }
  }

  return (
    <div
      className="bg-[var(--color-surface-0)] rounded-[var(--radius-card)] p-6"
      style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BuildingIcon size={18} className="text-[var(--color-text-muted)]" />
          <h2 className="font-semibold text-[var(--color-text-primary)]">Workspaces</h2>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-[var(--radius-btn)] bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity"
        >
          <PlusIcon size={14} />
          New workspace
        </button>
      </div>

      {showCreate && (
        <div className="mb-4 p-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] space-y-3">
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Acme Corp"
                className="w-full rounded px-3 py-1.5 text-sm border border-[var(--color-border)] bg-[var(--color-surface-0)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Slug</label>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
                placeholder="acme-corp"
                className="w-full rounded px-3 py-1.5 text-sm border border-[var(--color-border)] bg-[var(--color-surface-0)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Plan</label>
            <select
              value={form.plan}
              onChange={(e) => setForm({ ...form, plan: e.target.value })}
              className="w-full rounded px-3 py-1.5 text-sm border border-[var(--color-border)] bg-[var(--color-surface-0)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
            >
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                setShowCreate(false)
                setError(null)
              }}
              className="px-3 py-1.5 text-sm rounded-[var(--radius-btn)] border border-[var(--color-border)] hover:bg-[var(--color-surface-0)] transition-colors"
            >
              Cancel
            </button>
            <button
              disabled={!form.name.trim() || !form.slug.trim() || createMutation.isPending}
              onClick={handleCreate}
              className="px-3 py-1.5 text-sm rounded-[var(--radius-btn)] bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {createMutation.isPending ? "Creating…" : "Create"}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 rounded bg-[var(--color-surface-1)] animate-pulse" />
          ))}
        </div>
      ) : !workspaces?.length ? (
        <p className="text-sm text-[var(--color-text-muted)] py-4 text-center">No workspaces yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
              <th className="text-left pb-2">Name</th>
              <th className="text-left pb-2">Slug</th>
              <th className="text-left pb-2">Plan</th>
              <th className="text-left pb-2">Created</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {workspaces.map((ws) => (
              <tr key={ws.id}>
                <td className="py-2.5 font-medium text-[var(--color-text-primary)]">{ws.name}</td>
                <td className="py-2.5 font-mono text-xs text-[var(--color-text-muted)]">{ws.slug}</td>
                <td className="py-2.5 capitalize text-[var(--color-text-muted)]">{ws.plan}</td>
                <td className="py-2.5 text-[var(--color-text-muted)]">
                  {new Date(ws.createdAt).toLocaleDateString()}
                </td>
                <td className="py-2.5 text-right">
                  <button
                    onClick={() => {
                      if (confirm(`Delete workspace "${ws.name}"?`)) {
                        deleteMutation.mutate({ id: ws.id })
                      }
                    }}
                    className="p-1 rounded hover:bg-red-50 text-red-500 transition-colors"
                    title="Delete"
                  >
                    <TrashIcon size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
