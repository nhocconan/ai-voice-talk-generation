import { redirect } from "next/navigation"
import { auth } from "@/server/auth"
import { db } from "@/server/db/client"
import { AppShell } from "@/components/features/shell/AppShell"

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/login")

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { active: true },
  })
  if (!user?.active) redirect("/login")

  return <AppShell session={session}>{children}</AppShell>
}
