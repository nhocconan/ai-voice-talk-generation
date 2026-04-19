import { initTRPC, TRPCError } from "@trpc/server"
import { type Session } from "next-auth"
import superjson from "superjson"
import { ZodError } from "zod"
import { db } from "@/server/db/client"
import { writeAuditLog } from "@/server/services/audit"

interface CreateContextOptions {
  session: Session | null
  ip?: string
}

export function createTRPCContext(opts: CreateContextOptions) {
  return { db, session: opts.session, ip: opts.ip, audit: writeAuditLog }
}

export type Context = ReturnType<typeof createTRPCContext>

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    }
  },
})

export const router = t.router
export const publicProcedure = t.procedure
export const createCallerFactory = t.createCallerFactory

// Auth middleware
const enforceAuth = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" })
  }
  return next({ ctx: { ...ctx, session: ctx.session } })
})

// Admin middleware
const enforceAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) throw new TRPCError({ code: "UNAUTHORIZED" })
  const role = ctx.session.user.role as string
  if (role !== "ADMIN" && role !== "SUPER_ADMIN") {
    throw new TRPCError({ code: "FORBIDDEN" })
  }
  return next({ ctx: { ...ctx, session: ctx.session } })
})

// Super admin middleware
const enforceSuperAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) throw new TRPCError({ code: "UNAUTHORIZED" })
  if (ctx.session.user.role !== "SUPER_ADMIN") {
    throw new TRPCError({ code: "FORBIDDEN" })
  }
  return next({ ctx: { ...ctx, session: ctx.session } })
})

export const protectedProcedure = t.procedure.use(enforceAuth)
export const adminProcedure = t.procedure.use(enforceAdmin)
export const superAdminProcedure = t.procedure.use(enforceSuperAdmin)
