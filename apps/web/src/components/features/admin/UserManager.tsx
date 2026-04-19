"use client"

import { useState } from "react"
import { trpc } from "@/lib/trpc/client"
import { Role } from "@prisma/client"
import { PlusIcon, ShieldIcon } from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"

const inviteSchema = z.object({
  name: z.string().min(1, "Required"),
  email: z.string().email(),
  role: z.nativeEnum(Role),
})
type InviteForm = z.infer<typeof inviteSchema>

export function UserManager() {
  const [showInvite, setShowInvite] = useState(false)
  const [search, setSearch] = useState("")

  const { data, refetch } = trpc.admin.listUsers.useQuery({ search: search || undefined })
  const updateUser = trpc.admin.updateUser.useMutation({ onSuccess: () => refetch() })
  const createInvite = trpc.invite.create.useMutation({ onSuccess: () => { setShowInvite(false); refetch() } })

  const { register, handleSubmit, reset, formState: { errors } } = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { role: Role.USER },
  })

  const onInvite = async (data: InviteForm) => {
    await createInvite.mutateAsync(data)
    reset()
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="flex-1 max-w-xs px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui"
        />
        <button
          onClick={() => setShowInvite(!showInvite)}
          className="flex items-center gap-2 h-9 px-4 rounded-[var(--radius-pill)] bg-black text-white text-button hover:opacity-90"
        >
          <PlusIcon size={14} /> Invite
        </button>
      </div>

      {/* Invite form */}
      {showInvite && (
        <div
          className="p-5 rounded-[var(--radius-card)] bg-[var(--color-surface-0)]"
          style={{ boxShadow: "var(--shadow-outline-ring), var(--shadow-soft-lift)" }}
        >
          <h3 className="text-body-med mb-4">Invite User</h3>
          <form onSubmit={handleSubmit(onInvite)} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <input {...register("name")} placeholder="Full Name" className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui" />
              {errors.name && <p className="text-micro text-[var(--color-danger)] mt-1">{errors.name.message}</p>}
            </div>
            <div>
              <input {...register("email")} type="email" placeholder="email@younetgroup.com" className="w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui" />
              {errors.email && <p className="text-micro text-[var(--color-danger)] mt-1">{errors.email.message}</p>}
            </div>
            <div className="flex gap-2">
              <select {...register("role")} className="flex-1 px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] text-body-ui bg-white">
                <option value={Role.USER}>User</option>
                <option value={Role.ADMIN}>Admin</option>
              </select>
              <button type="submit" disabled={createInvite.isPending} className="h-9 px-4 rounded-[var(--radius-pill)] bg-black text-white text-button disabled:opacity-50">
                {createInvite.isPending ? "…" : "Send"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* User table */}
      <div
        className="rounded-[var(--radius-card)] overflow-hidden"
        style={{ border: "1px solid var(--color-border)" }}
      >
        <table className="w-full">
          <thead style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-surface-1)" }}>
            <tr>
              <th className="px-4 py-3 text-left text-caption text-[var(--color-text-muted)]">User</th>
              <th className="px-4 py-3 text-left text-caption text-[var(--color-text-muted)]">Role</th>
              <th className="px-4 py-3 text-left text-caption text-[var(--color-text-muted)]">Quota</th>
              <th className="px-4 py-3 text-left text-caption text-[var(--color-text-muted)]">Status</th>
              <th className="px-4 py-3 text-right text-caption text-[var(--color-text-muted)]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data?.users.map((user) => (
              <tr key={user.id} style={{ borderBottom: "1px solid var(--color-border-subtle,var(--color-border))" }}>
                <td className="px-4 py-3">
                  <div className="text-body-ui">{user.name}</div>
                  <div className="text-caption text-[var(--color-text-muted)]">{user.email}</div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-small flex items-center gap-1">
                    {user.role === "SUPER_ADMIN" && <ShieldIcon size={12} />}
                    {user.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-body-ui">{user.usedMinutes}/{user.quotaMinutes} min</td>
                <td className="px-4 py-3">
                  <span className={`text-micro ${user.active ? "text-[var(--color-success)]" : "text-[var(--color-danger)]"}`}>
                    {user.active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => updateUser.mutate({ id: user.id, active: !user.active })}
                    className="text-caption text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] underline"
                  >
                    {user.active ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
