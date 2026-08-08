"""Test settings — extends base settings, switches DATABASES to SQLite in-memory."""

from .settings import *  # noqa: F401, F403

ALLOWED_HOSTS = ["*"]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

# Fast hasher — PBKDF2 dominates suite runtime otherwise (every fixture user).
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
