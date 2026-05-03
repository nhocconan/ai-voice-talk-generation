import NextAuth from "next-auth"
import { middlewareAuthConfig } from "@/server/auth/middleware-config"

export default NextAuth(middlewareAuthConfig).auth

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|public/).*)"],
}
