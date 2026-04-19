import type { NextAuthConfig } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { env } from "@/env"
import { db } from "@/server/db/client"
import { writeAuditLog } from "@/server/services/audit"

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
})

export const authConfig: NextAuthConfig = {
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return null

        const user = await db.user.findUnique({ where: { email: parsed.data.email } })
        if (!user || !user.active) return null

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash)
        if (!valid) return null

        await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

        const ip = request.headers?.get("x-forwarded-for") ?? undefined
        await writeAuditLog({
          actorId: user.id,
          action: "auth.login",
          targetType: "User",
          targetId: user.id,
          ...(ip ? { ip } : {}),
        })

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          forcePasswordChange: user.forcePasswordChange,
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token["id"] = user.id
        token["role"] = user.role
        token["forcePasswordChange"] = user.forcePasswordChange
      }
      return token
    },
    session({ session, token }) {
      if (token) {
        session.user.id = token["id"] as string
        session.user.role = token["role"] as typeof session.user.role
        session.user.forcePasswordChange = Boolean(token["forcePasswordChange"])
      }
      return session
    },
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isAppPath = nextUrl.pathname.startsWith("/app")
      const isAdminPath = nextUrl.pathname.startsWith("/admin")
      const isLoginPage = nextUrl.pathname === "/login"
      const isApiAuth = nextUrl.pathname.startsWith("/api/auth")

      if (isApiAuth) return true

      if (!isLoggedIn && (isAppPath || isAdminPath)) {
        return Response.redirect(new URL("/login", nextUrl))
      }

      if (isLoggedIn && isLoginPage) {
        return Response.redirect(new URL("/app", nextUrl))
      }

      if (isLoggedIn && auth.user?.forcePasswordChange) {
        const isChangePwPage = nextUrl.pathname === "/app/change-password"
        if (!isChangePwPage && isAppPath) {
          return Response.redirect(new URL("/app/change-password", nextUrl))
        }
      }

      return true
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  secret: env.AUTH_SECRET,
}
