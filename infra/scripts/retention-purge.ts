#!/usr/bin/env tsx
/**
 * Retention purge job — deletes MinIO renders/ objects older than retention.renderDays setting.
 * Usage:
 *   DRY_RUN=1 tsx infra/scripts/retention-purge.ts   # log only
 *   tsx infra/scripts/retention-purge.ts              # live delete
 *
 * Required env: DATABASE_URL, MINIO_ENDPOINT, MINIO_PORT, MINIO_ACCESS_KEY,
 *               MINIO_SECRET_KEY, MINIO_BUCKET, MINIO_USE_SSL
 */

import { PrismaClient, Prisma } from "@prisma/client"
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  type ObjectIdentifier,
} from "@aws-sdk/client-s3"

const DRY_RUN = process.env["DRY_RUN"] === "1"

const db = new PrismaClient()

const s3 = new S3Client({
  endpoint: `${process.env["MINIO_USE_SSL"] === "true" ? "https" : "http"}://${process.env["MINIO_ENDPOINT"]}:${process.env["MINIO_PORT"] ?? 9000}`,
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env["MINIO_ACCESS_KEY"]!,
    secretAccessKey: process.env["MINIO_SECRET_KEY"]!,
  },
  forcePathStyle: true,
})

const BUCKET = process.env["MINIO_BUCKET"]!

async function getRetentionDays(): Promise<number> {
  const setting = await db.setting.findUnique({ where: { key: "retention.renderDays" } })
  if (setting?.value && typeof setting.value === "number") return setting.value
  return 30 // default fallback
}

async function listRenderObjects(olderThanMs: number): Promise<ObjectIdentifier[]> {
  const toDelete: ObjectIdentifier[] = []
  let continuationToken: string | undefined

  do {
    const resp = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: "renders/",
        ContinuationToken: continuationToken,
      })
    )

    for (const obj of resp.Contents ?? []) {
      if (obj.Key && obj.LastModified && obj.LastModified.getTime() < olderThanMs) {
        toDelete.push({ Key: obj.Key })
      }
    }

    continuationToken = resp.NextContinuationToken
  } while (continuationToken)

  return toDelete
}

async function main() {
  const retentionDays = await getRetentionDays()
  const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  const cutoffDate = new Date(cutoffMs).toISOString()

  console.log(`[retention-purge] mode=${DRY_RUN ? "DRY_RUN" : "LIVE"} retentionDays=${retentionDays} cutoff=${cutoffDate}`)

  const toDelete = await listRenderObjects(cutoffMs)
  console.log(`[retention-purge] found ${toDelete.length} object(s) to delete`)

  if (toDelete.length === 0) {
    console.log("[retention-purge] nothing to do")
    await db.auditLog.create({
      data: {
        action: "retention.purge",
        targetType: "StorageObject",
        targetId: "renders/",
        meta: { dryRun: DRY_RUN, deleted: 0, cutoff: cutoffDate } as Prisma.InputJsonValue,
      },
    })
    return
  }

  if (!DRY_RUN) {
    // Delete in batches of 1000 (S3 limit)
    const batches: ObjectIdentifier[][] = []
    for (let i = 0; i < toDelete.length; i += 1000) {
      batches.push(toDelete.slice(i, i + 1000))
    }

    let totalDeleted = 0
    for (const batch of batches) {
      const result = await s3.send(
        new DeleteObjectsCommand({
          Bucket: BUCKET,
          Delete: { Objects: batch, Quiet: false },
        })
      )
      totalDeleted += result.Deleted?.length ?? 0
      if (result.Errors?.length) {
        console.error("[retention-purge] delete errors:", result.Errors)
      }
    }

    console.log(`[retention-purge] deleted ${totalDeleted} object(s)`)

    // Mark EXPIRED generations in DB
    await db.generation.updateMany({
      where: {
        createdAt: { lt: new Date(cutoffMs) },
        status: "DONE",
        outputMp3Key: { not: null },
      },
      data: { status: "CANCELLED" },
    })

    await db.auditLog.create({
      data: {
        action: "retention.purge",
        targetType: "StorageObject",
        targetId: "renders/",
        meta: { dryRun: false, deleted: totalDeleted, cutoff: cutoffDate } as Prisma.InputJsonValue,
      },
    })
  } else {
    console.log("[retention-purge] DRY_RUN — would delete:")
    for (const obj of toDelete.slice(0, 20)) {
      console.log("  ", obj.Key)
    }
    if (toDelete.length > 20) console.log(`  … and ${toDelete.length - 20} more`)
    await db.auditLog.create({
      data: {
        action: "retention.purge",
        targetType: "StorageObject",
        targetId: "renders/",
        meta: { dryRun: true, wouldDelete: toDelete.length, cutoff: cutoffDate } as Prisma.InputJsonValue,
      },
    })
  }
}

main()
  .catch((err) => {
    console.error("[retention-purge] fatal:", err)
    process.exit(1)
  })
  .finally(() => db.$disconnect())
