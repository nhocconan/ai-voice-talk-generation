import { redirect } from "next/navigation"
import { auth } from "@/server/auth"

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect("/login")
  const role = session.user.role as string
  if (role !== "ADMIN" && role !== "SUPER_ADMIN") redirect("/app/dashboard")
  return <>{children}</>
}
