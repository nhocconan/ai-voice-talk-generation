import { router } from "@/server/trpc"
import { userRouter } from "./user"
import { inviteRouter } from "./invite"
import { voiceProfileRouter } from "./voiceProfile"
import { generationRouter } from "./generation"
import { adminRouter } from "./admin"
import { settingsRouter } from "./settings"

export const appRouter = router({
  user: userRouter,
  invite: inviteRouter,
  voiceProfile: voiceProfileRouter,
  generation: generationRouter,
  admin: adminRouter,
  settings: settingsRouter,
})

export type AppRouter = typeof appRouter
