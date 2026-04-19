from ..config import settings


def decrypt_api_key(ciphertext: str) -> str:
    """Decrypt AES-256-GCM ciphertext produced by the web app crypto service."""
    import base64
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    raw = base64.b64decode(ciphertext)
    iv = raw[:12]
    tag = raw[12:28]
    encrypted = raw[28:]

    key = settings.server_secret.ljust(32, "0")[:32].encode()
    aesgcm = AESGCM(key)
    # In GCM mode, cryptography lib appends the tag to ciphertext
    decrypted = aesgcm.decrypt(iv, encrypted + tag, None)
    return decrypted.decode()
