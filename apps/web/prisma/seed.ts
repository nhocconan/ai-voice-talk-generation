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
    where: { name: ProviderName.VIENEU_TTS },
    update: {
      config: { model: "pnnbao-ump/VieNeu-TTS", mode: "local", device: "mps", maxChunkChars: 320 },
    },
    create: {
      name: ProviderName.VIENEU_TTS,
      enabled: false,
      isDefault: false,
      config: { model: "pnnbao-ump/VieNeu-TTS", mode: "local", device: "mps", maxChunkChars: 320 },
    },
  })

  await prisma.providerConfig.upsert({
    where: { name: ProviderName.VOXCPM2 },
    update: {
      config: {
        model: "openbmb/VoxCPM2",
        device: "cuda",
        cfgValue: 2,
        inferenceTimesteps: 10,
        loadDenoiser: false,
        usePromptClone: false,
        maxChunkChars: 260,
      },
    },
    create: {
      name: ProviderName.VOXCPM2,
      enabled: false,
      isDefault: false,
      config: {
        model: "openbmb/VoxCPM2",
        device: "cuda",
        cfgValue: 2,
        inferenceTimesteps: 10,
        loadDenoiser: false,
        usePromptClone: false,
        maxChunkChars: 260,
      },
    },
  })

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

  await prisma.providerConfig.upsert({
    where: { name: ProviderName.VIBEVOICE },
    update: {},
    create: {
      name: ProviderName.VIBEVOICE,
      enabled: false,
      isDefault: false,
      config: { model: "vibevoice-1.5b", device: "cuda" },
    },
  })

  await prisma.providerConfig.upsert({
    where: { name: ProviderName.XIAOMI_TTS },
    update: {},
    create: {
      name: ProviderName.XIAOMI_TTS,
      enabled: false,
      isDefault: false,
      config: {
        baseUrl: "",
        model: "mimo-v2.5-tts",
        cloneModel: "mimo-v2.5-tts-voiceclone",
        voice: "Chloe",
        format: "wav",
        style: "",
        maxChunkChars: 1500,
      },
    },
  })

  await prisma.providerConfig.upsert({
    where: { name: ProviderName.XAI_TTS },
    update: {},
    create: {
      name: ProviderName.XAI_TTS,
      enabled: false,
      isDefault: false,
      config: {
        voice: "eve",
        codec: "mp3",
        sampleRate: 24000,
        bitRate: 128000,
        textNormalization: false,
        maxChunkChars: 5000,
      },
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
    { key: "webhook.url", value: "" },
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
