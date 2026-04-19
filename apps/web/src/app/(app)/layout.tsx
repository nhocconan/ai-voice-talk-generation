import { redirect } from "next/navigation"
import { auth } from "@/server/auth"
import { AppShell } from "@/components/features/shell/AppShell"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/login")

  return <AppShell session={session}>{children}</AppShell>
}
