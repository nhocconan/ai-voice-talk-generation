import { notFound, redirect } from "next/navigation"
import { auth } from "@/server/auth"
import { db } from "@/server/db/client"

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
  return <>{children}</>
}
