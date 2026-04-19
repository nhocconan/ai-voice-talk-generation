import { Prisma, PrismaClient, Role, ProviderName } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  // Super admin
  const passwordHash = await bcrypt.hash("YouNet@2026", 12)
  await prisma.user.upsert({
    where: { email: "admin@younetgroup.com" },
    update: {},
    create: {
      email: "admin@younetgroup.com",
      name: "Super Admin",
      passwordHash,
      role: Role.SUPER_ADMIN,
      forcePasswordChange: true,
      quotaMinutes: 9999,
    },
  })

  // Default provider configs
  await prisma.providerConfig.upsert({
    where: { name: ProviderName.XTTS_V2 },
    update: {},
    create: {
      name: ProviderName.XTTS_V2,
      enabled: true,
      isDefault: true,
      config: { model: "xtts_v2", device: "mps" },
    },
  })

  await prisma.providerConfig.upsert({
    where: { name: ProviderName.F5_TTS },
    update: {},
    create: {
      name: ProviderName.F5_TTS,
      enabled: false,
      isDefault: false,
      config: { model: "F5-TTS", device: "mps" },
    },
  })

  await prisma.providerConfig.upsert({
    where: { name: ProviderName.ELEVENLABS },
    update: {},
    create: {
      name: ProviderName.ELEVENLABS,
      enabled: false,
      isDefault: false,
      config: { model: "eleven_multilingual_v2" },
    },
  })

  await prisma.providerConfig.upsert({
    where: { name: ProviderName.GEMINI_TTS },
    update: {},
    create: {
      name: ProviderName.GEMINI_TTS,
      enabled: false,
      isDefault: false,
      config: { model: "gemini-2.5-flash-preview-tts" },
    },
  })

  // Default settings
  const settings: Array<{ key: string; value: Prisma.InputJsonValue }> = [
    { key: "retention.renderDays", value: 90 },
    { key: "quota.defaultMinutes", value: 60 },
    { key: "generation.maxMinutes", value: 60 },
    { key: "branding.accentHex", value: "#E5001A" },
    { key: "feature.orgSharedLibrary", value: true },
    { key: "feature.publicShareLinks", value: false },
  ]

  for (const s of settings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: {},
      create: { key: s.key, value: s.value },
    })
  }

  console.log("✅ Seed complete — admin@younetgroup.com / YouNet@2026 (force password change on first login)")
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
