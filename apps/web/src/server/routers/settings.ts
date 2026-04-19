import { router, publicProcedure } from "@/server/trpc"

export const settingsRouter = router({
  public: publicProcedure.query(async ({ ctx }) => {
    const settings = await ctx.db.setting.findMany({
      where: { key: { in: ["branding.accentHex", "feature.orgSharedLibrary", "feature.publicShareLinks"] } },
    })
    return Object.fromEntries(settings.map((s) => [s.key, s.value]))
  }),
})
