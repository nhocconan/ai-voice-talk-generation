declare module "libsodium-wrappers-sumo" {
  export interface SodiumModule {
    ready: Promise<void>
    crypto_box_SEEDBYTES: number
    crypto_box_seed_keypair(seed: Uint8Array): {
      publicKey: Uint8Array
      privateKey: Uint8Array
    }
    crypto_box_seal(message: Uint8Array, publicKey: Uint8Array): Uint8Array
    crypto_box_seal_open(
      ciphertext: Uint8Array,
      publicKey: Uint8Array,
      privateKey: Uint8Array,
    ): Uint8Array
    from_string(value: string): Uint8Array
    to_string(value: Uint8Array): string
  }

  const sodium: SodiumModule
  export = sodium
}
