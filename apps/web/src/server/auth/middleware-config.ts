/**
 * Edge-compatible auth config for Next.js middleware.
 * No Prisma or bcrypt imports — must run in the Edge runtime.
 */
import type { NextAuthConfig } from "next-auth"

export const middlewareAuthConfig: NextAuthConfig = {
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isAppPath = [
        "/dashboard",
        "/voices",
        "/generate",
        "/history",
        "/change-password",
        "/settings",
      ].some((prefix) => nextUrl.pathname === prefix || nextUrl.pathname.startsWith(`${prefix}/`))
      const isAdminPath = nextUrl.pathname.startsWith("/admin")
      const isLoginPage = nextUrl.pathname === "/login"
      const isApiAuth = nextUrl.pathname.startsWith("/api/auth")

      if (isApiAuth) return true

      if (!isLoggedIn && (isAppPath || isAdminPath)) {
        return Response.redirect(new URL("/login", nextUrl))
      }

      if (isLoggedIn && isLoginPage) {
        return Response.redirect(new URL("/dashboard", nextUrl))
      }

      if (isLoggedIn && auth.user?.forcePasswordChange) {
        const isChangePwPage = nextUrl.pathname === "/change-password"
        if (!isChangePwPage && isAppPath) {
          return Response.redirect(new URL("/change-password", nextUrl))
        }
      }

      return true
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: { strategy: "jwt" },
  secret: process.env["AUTH_SECRET"] ?? "",
}
