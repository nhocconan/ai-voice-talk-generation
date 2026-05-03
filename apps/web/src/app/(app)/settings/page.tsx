import { auth } from "@/server/auth"
import { redirect } from "next/navigation"
import { ApiKeyManager } from "@/components/features/settings/ApiKeyManager"

export const metadata = { title: "Settings — YouNet Voice Studio" }

export default async function SettingsPage() {
  const session = await auth()
  if (!session) redirect("/login")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-[var(--color-text-primary)]">
          Settings
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
          Manage your API keys and account settings
        </p>
      </div>
      <ApiKeyManager />
    </div>
  )
}
