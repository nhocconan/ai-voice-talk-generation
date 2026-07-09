import { Prisma, PrismaClient, Role, ProviderName } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  // Super admin
  const passwordHash = await bcrypt.hash("Demo1234", 12)
  await prisma.user.upsert({
    where: { email: "admin@demo.demo" },
    update: {},
    create: {
      email: "admin@demo.demo",
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

  // Soft-dropped: stock Coqui XTTS-v2 has no Vietnamese. Keep the row for
  // historical generations, but never enable it on seed.
  await prisma.providerConfig.upsert({
    where: { name: ProviderName.XTTS_V2 },
    update: {
      enabled: false,
      isDefault: false,
      config: {
        model: "tts_models/multilingual/multi-dataset/xtts_v2",
        device: "mps",
        deprecated: true,
      },
    },
    create: {
      name: ProviderName.XTTS_V2,
      enabled: false,
      isDefault: false,
      config: {
        model: "tts_models/multilingual/multi-dataset/xtts_v2",
        device: "mps",
        deprecated: true,
      },
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

  await prisma.providerConfig.upsert({
    where: { name: ProviderName.MINIMAX_TTS },
    update: {},
    create: {
      name: ProviderName.MINIMAX_TTS,
      enabled: false,
      isDefault: false,
      config: {
        model: "speech-2.8-hd",
        voice: "Wise_Woman",
        format: "mp3",
        sampleRate: 32000,
        bitRate: 128000,
        noiseReduction: false,
        maxChunkChars: 3000,
      },
    },
  })

  // LLM providers (script drafting)
  await prisma.providerConfig.upsert({
    where: { name: ProviderName.GEMINI_LLM },
    update: {},
    create: {
      name: ProviderName.GEMINI_LLM,
      enabled: false,
      isDefault: false,
      config: { model: "gemini-2.5-flash" },
    },
  })

  await prisma.providerConfig.upsert({
    where: { name: ProviderName.GROQ },
    update: {},
    create: {
      name: ProviderName.GROQ,
      enabled: false,
      isDefault: false,
      config: { baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
    },
  })

  await prisma.providerConfig.upsert({
    where: { name: ProviderName.XAI_LLM },
    update: {},
    create: {
      name: ProviderName.XAI_LLM,
      enabled: false,
      isDefault: false,
      config: { baseUrl: "https://api.x.ai/v1", model: "grok-4.3" },
    },
  })

  await prisma.providerConfig.upsert({
    where: { name: ProviderName.GROK_OAUTH },
    update: {},
    create: {
      name: ProviderName.GROK_OAUTH,
      enabled: false,
      isDefault: false,
      config: { model: "grok-4.3" },
    },
  })

  await prisma.providerConfig.upsert({
    where: { name: ProviderName.OLLAMA },
    update: {},
    create: {
      name: ProviderName.OLLAMA,
      enabled: false,
      isDefault: false,
      config: { baseUrl: "http://localhost:11434/v1", model: "qwen2.5:7b" },
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

  console.log("✅ Seed complete — admin@demo.demo / Demo1234 (force password change on first login)")
}

main()
  .catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
