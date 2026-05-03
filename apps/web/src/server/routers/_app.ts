import { router } from "@/server/trpc"
import { userRouter } from "./user"
import { inviteRouter } from "./invite"
import { voiceProfileRouter } from "./voiceProfile"
import { generationRouter } from "./generation"
import { adminRouter } from "./admin"
import { settingsRouter } from "./settings"
import { apiKeyRouter } from "./apiKey"
import { workspaceRouter } from "./workspace"
import { authRouter } from "./auth"
import { systemRouter } from "./system"

export const appRouter = router({
  user: userRouter,
  invite: inviteRouter,
  voiceProfile: voiceProfileRouter,
  generation: generationRouter,
  admin: adminRouter,
  settings: settingsRouter,
  apiKey: apiKeyRouter,
  workspace: workspaceRouter,
  auth: authRouter,
  system: systemRouter,
})

export type AppRouter = typeof appRouter
