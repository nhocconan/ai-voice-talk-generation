import type { NextAuthConfig } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { env } from "@/env"
import { db } from "@/server/db/client"
import { writeAuditLog } from "@/server/services/audit"
import { isLoginLocked, recordLoginFailure, clearLoginFailures } from "@/server/services/rate-limit"
import { verifyRecaptchaToken } from "@/server/services/recaptcha"

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
        recaptchaToken: { label: "reCAPTCHA", type: "text" },
      },
      async authorize(credentials, request) {
        const parsed = loginSchema.safeParse(credentials)
        if (!parsed.success) return null
        const email = parsed.data.email
        const ip = request.headers?.get("x-forwarded-for")?.split(",")[0]?.trim()

        // Brute-force lockout: too many recent failures → reject before checking.
        if (await isLoginLocked(email)) return null

        // reCAPTCHA (no-op unless enabled in Admin → Settings).
        const recaptchaToken = typeof credentials?.["recaptchaToken"] === "string" ? credentials["recaptchaToken"] : ""
        if (!(await verifyRecaptchaToken(recaptchaToken, ip))) return null

        const user = await db.user.findUnique({ where: { email } })
        if (!user || !user.active) {
          await recordLoginFailure(email)
          return null
        }

        const valid = await bcrypt.compare(parsed.data.password, user.passwordHash)
        if (!valid) {
          await recordLoginFailure(email)
          return null
        }

        await clearLoginFailures(email)
        await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })

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
    async jwt({ token, user }) {
      if (user) {
        token["id"] = user.id
        token["role"] = user.role
        token["forcePasswordChange"] = user.forcePasswordChange
      }

      if (typeof token["id"] === "string") {
        const currentUser = await db.user.findUnique({
          where: { id: token["id"] },
          select: { email: true, name: true, role: true, forcePasswordChange: true },
        })

        if (currentUser) {
          token.email = currentUser.email
          token.name = currentUser.name
          token["role"] = currentUser.role
          token["forcePasswordChange"] = currentUser.forcePasswordChange
        }
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
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  secret: env.AUTH_SECRET,
  // Production runs behind Traefik, which sets the Host header to PUBLIC_HOST.
  // next-auth v5 does not auto-trust the request host in production, so without
  // this every authenticated request throws UntrustedHost (login/cookies break).
  trustHost: true,
}
