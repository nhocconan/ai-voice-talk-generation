import { env } from "@/env"
import crypto from "crypto"
import { createRequire } from "module"

const LEGACY_ALGORITHM = "aes-256-gcm"
const LEGACY_KEY = Buffer.from(env.SERVER_SECRET.padEnd(32, "0").slice(0, 32), "utf8")
const SEALED_BOX_PREFIX = "sbx1:"
const require = createRequire(import.meta.url)
let sodiumPromise: Promise<import("libsodium-wrappers-sumo").SodiumModule> | undefined

export async function encryptApiKey(plaintext: string): Promise<string> {
  return encryptApiKeySealedBox(plaintext)
}

export async function decryptApiKey(ciphertext: string): Promise<string> {
  if (ciphertext.startsWith(SEALED_BOX_PREFIX)) {
    return decryptApiKeySealedBox(ciphertext)
  }

  return decryptApiKeyLegacy(ciphertext)
}

function decryptApiKeyLegacy(ciphertext: string): string {
  const buf = Buffer.from(ciphertext, "base64")
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const encrypted = buf.subarray(28)
  const decipher = crypto.createDecipheriv(LEGACY_ALGORITHM, LEGACY_KEY, iv)
  decipher.setAuthTag(tag)
  return decipher.update(encrypted).toString("utf8") + decipher.final("utf8")
}

async function getSodium() {
  sodiumPromise ??= Promise.resolve(require("libsodium-wrappers-sumo") as import("libsodium-wrappers-sumo").SodiumModule)
    .then(async (sodium) => {
      await sodium.ready
      return sodium
    })

  return sodiumPromise
}

async function encryptApiKeySealedBox(plaintext: string): Promise<string> {
  const sodium = await getSodium()
  const { publicKey } = await getRecipientKeyPair()
  const encrypted = sodium.crypto_box_seal(sodium.from_string(plaintext), publicKey)

  return `${SEALED_BOX_PREFIX}${Buffer.from(encrypted).toString("base64")}`
}

async function decryptApiKeySealedBox(ciphertext: string): Promise<string> {
  const sodium = await getSodium()
  const raw = Uint8Array.from(Buffer.from(ciphertext.slice(SEALED_BOX_PREFIX.length), "base64"))
  const { publicKey, privateKey } = await getRecipientKeyPair()
  const decrypted = sodium.crypto_box_seal_open(raw, publicKey, privateKey)

  return sodium.to_string(decrypted)
}

async function getRecipientKeyPair() {
  const sodium = await getSodium()
  const seed = crypto
    .createHash("sha256")
    .update(`provider-api-key:${env.SERVER_SECRET}`, "utf8")
    .digest()
    .subarray(0, sodium.crypto_box_SEEDBYTES)
  const { publicKey, privateKey } = sodium.crypto_box_seed_keypair(seed)

  return {
    publicKey,
    privateKey,
  }
}
