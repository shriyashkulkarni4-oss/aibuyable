from cryptography.fernet import Fernet
from app.config import settings
import base64


def _get_fernet() -> Fernet:
    """
    Returns a Fernet cipher instance using the ENCRYPTION_KEY from settings.
    If the key is empty (dev/test), generates a temporary one with a warning.
    """
    key = settings.ENCRYPTION_KEY
    if not key:
        # Dev fallback — NOT for production
        import warnings
        warnings.warn("ENCRYPTION_KEY not set — using a temporary key. Set ENCRYPTION_KEY in .env for production.")
        key = Fernet.generate_key().decode()
    # Fernet expects a URL-safe base64 encoded 32-byte key
    try:
        return Fernet(key.encode() if isinstance(key, str) else key)
    except Exception:
        # If key is invalid, generate one (dev safety net only)
        return Fernet(Fernet.generate_key())


def encrypt_secret(plaintext: str) -> str:
    """Encrypt a plaintext string (Razorpay secret) using Fernet symmetric encryption."""
    if not plaintext:
        return ""
    f = _get_fernet()
    return f.encrypt(plaintext.encode()).decode()


def decrypt_secret(ciphertext: str) -> str:
    """Decrypt a Fernet-encrypted string back to plaintext."""
    if not ciphertext:
        return ""
    f = _get_fernet()
    return f.decrypt(ciphertext.encode()).decode()
