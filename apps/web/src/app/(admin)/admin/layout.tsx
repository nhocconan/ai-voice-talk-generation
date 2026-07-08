import { notFound, redirect } from "next/navigation"
import { auth } from "@/server/auth"
import { db } from "@/server/db/client"
import { AppShell } from "@/components/features/shell/AppShell"

// The admin layout calls auth() + db (cookies/session), so the whole admin
// subtree is inherently dynamic. Force-dynamic here prevents next build from
// trying to prerender admin pages at build time (which would run this layout
// without a session and crash).
export const dynamic = "force-dynamic"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/login")
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { active: true },
  })
  if (!user?.active) redirect("/login")
  const role = session.user.role as string
  if (role !== "ADMIN" && role !== "SUPER_ADMIN") notFound()
  return <AppShell session={session}>{children}</AppShell>
}
