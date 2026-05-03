import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { router, protectedProcedure, adminProcedure } from "@/server/trpc"
import { Role } from "@prisma/client"

export const workspaceRouter = router({
  // List workspaces the current user belongs to
  list: protectedProcedure.query(async ({ ctx }) => {
    const role = ctx.session.user.role as string
    const isGlobalAdmin = role === "ADMIN" || role === "SUPER_ADMIN"

    if (isGlobalAdmin) {
      return ctx.db.workspace.findMany({ orderBy: { createdAt: "desc" } })
    }

    return ctx.db.workspace.findMany({
      where: { members: { some: { userId: ctx.session.user.id } } },
      orderBy: { createdAt: "desc" },
    })
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const ws = await ctx.db.workspace.findUniqueOrThrow({
        where: { id: input.id },
        include: {
          members: { include: { user: { select: { id: true, name: true, email: true, role: true } } } },
        },
      })
      const isMember = ws.members.some((m) => m.userId === ctx.session.user.id)
      const role = ctx.session.user.role as string
      const isGlobalAdmin = role === "ADMIN" || role === "SUPER_ADMIN"
      if (!isMember && !isGlobalAdmin) throw new TRPCError({ code: "FORBIDDEN" })
      return ws
    }),

  create: adminProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      slug: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
      plan: z.enum(["free", "pro", "enterprise"]).default("free"),
    }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.workspace.findUnique({ where: { slug: input.slug } })
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "Slug already taken" })

      const workspace = await ctx.db.workspace.create({
        data: {
          slug: input.slug,
          name: input.name,
          plan: input.plan,
          members: {
            create: { userId: ctx.session.user.id, role: Role.ADMIN },
          },
        },
      })

      await ctx.audit({
        actorId: ctx.session.user.id,
        action: "workspace.create",
        targetType: "Workspace",
        targetId: workspace.id,
        meta: { slug: input.slug, plan: input.plan },
      })

      return workspace
    }),

  addMember: adminProcedure
    .input(z.object({
      workspaceId: z.string(),
      userId: z.string(),
      role: z.nativeEnum(Role).default(Role.USER),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } },
        update: { role: input.role },
        create: { workspaceId: input.workspaceId, userId: input.userId, role: input.role },
      })
      await ctx.audit({
        actorId: ctx.session.user.id,
        action: "workspace.addMember",
        targetType: "Workspace",
        targetId: input.workspaceId,
        meta: { userId: input.userId, role: input.role },
      })
    }),

  removeMember: adminProcedure
    .input(z.object({ workspaceId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.workspaceMember.deleteMany({
        where: { workspaceId: input.workspaceId, userId: input.userId },
      })
      await ctx.audit({
        actorId: ctx.session.user.id,
        action: "workspace.removeMember",
        targetType: "Workspace",
        targetId: input.workspaceId,
        meta: { userId: input.userId },
      })
    }),

  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.workspace.delete({ where: { id: input.id } })
      await ctx.audit({
        actorId: ctx.session.user.id,
        action: "workspace.delete",
        targetType: "Workspace",
        targetId: input.id,
      })
    }),
})
