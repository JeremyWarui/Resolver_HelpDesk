"""Test settings — extends base settings, switches DATABASES to SQLite in-memory."""

import os

# Replaced below; set so the base settings load without a real database.
os.environ.setdefault("DATABASE_URL", "sqlite://:memory:")

from .settings import *  # noqa: E402, F401, F403

ALLOWED_HOSTS = ["*"]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

# Fast hasher — PBKDF2 dominates suite runtime otherwise (every fixture user).
PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
