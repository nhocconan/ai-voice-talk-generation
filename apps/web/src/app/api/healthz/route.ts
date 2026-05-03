import { NextResponse } from "next/server"
import { db } from "@/server/db/client"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    await db.$queryRaw`SELECT 1`
    return NextResponse.json({ status: "ok" })
  } catch (err) {
    return NextResponse.json({ status: "error", detail: String(err) }, { status: 503 })
  }
}
