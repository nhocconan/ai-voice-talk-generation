import type { Prisma } from "@prisma/client"
import { db } from "@/server/db/client"

interface AuditParams {
  actorId?: string | undefined
  action: string
  targetType: string
  targetId?: string | undefined
  meta?: Prisma.InputJsonValue | undefined
  ip?: string | undefined
}

export async function writeAuditLog(params: AuditParams): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: params.actorId ?? null,
      action: params.action,
      targetType: params.targetType,
      targetId: params.targetId ?? null,
      meta: params.meta ?? {},
      ip: params.ip ?? null,
    },
  })
}
