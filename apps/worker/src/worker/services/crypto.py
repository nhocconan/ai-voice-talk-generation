from __future__ import annotations

import base64
import hashlib

from nacl.bindings import crypto_box_seal_open, crypto_box_seed_keypair

from ..config import settings

SEALED_BOX_PREFIX = "sbx1:"


def decrypt_api_key(ciphertext: str) -> str:
    """Decrypt API-key ciphertext produced by the web app crypto service."""
    if ciphertext.startswith(SEALED_BOX_PREFIX):
        return _decrypt_sealed_box(ciphertext)

    return _decrypt_legacy(ciphertext)


def _decrypt_legacy(ciphertext: str) -> str:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    raw = base64.b64decode(ciphertext)
    iv = raw[:12]
    tag = raw[12:28]
    encrypted = raw[28:]

    key = settings.server_secret.ljust(32, "0")[:32].encode()
    aesgcm = AESGCM(key)
    decrypted = aesgcm.decrypt(iv, encrypted + tag, None)
    return decrypted.decode()


def _decrypt_sealed_box(ciphertext: str) -> str:
    raw = base64.b64decode(ciphertext[len(SEALED_BOX_PREFIX) :])
    seed = hashlib.sha256(
        f"provider-api-key:{settings.server_secret}".encode()
    ).digest()
    public_key, private_key = crypto_box_seed_keypair(seed)
    decrypted = crypto_box_seal_open(raw, public_key, private_key)
    return decrypted.decode("utf-8")
