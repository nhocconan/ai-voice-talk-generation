import { fetchRequestHandler } from "@trpc/server/adapters/fetch"
import { type NextRequest } from "next/server"
import { appRouter } from "@/server/routers/_app"
import { createTRPCContext } from "@/server/trpc"
import { auth } from "@/server/auth"

const handler = async (req: NextRequest) => {
  const session = await auth()
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () =>
      createTRPCContext({
        session,
        ip: req.headers.get("x-forwarded-for") ?? undefined,
      }),
    onError: ({ path, error }) => {
      if (error.code === "INTERNAL_SERVER_ERROR") {
        // logger.error({ path, error: error.message }, "tRPC error")
        console.error(`tRPC error on ${path ?? "unknown"}:`, error)
      }
    },
  })
}

export { handler as GET, handler as POST }
